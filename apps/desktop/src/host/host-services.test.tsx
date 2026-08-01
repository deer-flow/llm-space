import { beforeEach, describe, expect, mock, test } from "bun:test";

import {
  type ModelConfig,
  type Thread,
} from "@llm-space/core";
import { createOneShotRunner } from "@llm-space/core/workflow";
import type { HostServices } from "@llm-space/ui/host";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  AbortStreamThreadPayload,
  StreamThreadRequestPayload,
  StreamThreadResponsePayload,
} from "@/shared/rpc";
import type { RuntimeId } from "@/shared/runtime";

import {
  createThreadStore,
  ThreadStoreContext,
} from "../../../../packages/ui/src/components/thread-playground/stores/thread-store";

type ResponseListener = (message: StreamThreadResponsePayload) => void;

class ControllableRpc {
  readonly aborts: AbortStreamThreadPayload[] = [];
  readonly envRequests: Record<string, unknown>[] = [];
  readonly mcpRequests: Record<string, unknown>[] = [];
  readonly searchRequests: Record<string, unknown>[] = [];
  readonly skillListRequests: Record<string, unknown>[] = [];
  readonly skillSettingsRequests: Record<string, unknown>[] = [];
  readonly starts: StreamThreadRequestPayload[] = [];
  private readonly _listeners = new Set<ResponseListener>();

  readonly request = {
    generatorResolveEnv: (payload: Record<string, unknown>) => {
      this.envRequests.push(payload);
      return Promise.resolve({ modelApiKey: "remote-secret", envValues: {} });
    },
    getSearchSettings: (payload: Record<string, unknown>) => {
      this.searchRequests.push(payload);
      return Promise.resolve({ provider: "builtin" as const });
    },
    mcpListServers: (payload: Record<string, unknown>) => {
      this.mcpRequests.push(payload);
      return Promise.resolve([]);
    },
    skillsGetSettings: (payload: Record<string, unknown>) => {
      this.skillSettingsRequests.push(payload);
      return Promise.resolve({
        discoveryPaths: [{ path: "/remote/skills", hiddenSkills: [] }],
      });
    },
    skillsListSkills: (payload: Record<string, unknown>) => {
      this.skillListRequests.push(payload);
      return Promise.resolve([]);
    },
  };

  readonly send = {
    abortStreamThread: (payload: AbortStreamThreadPayload) => {
      this.aborts.push(payload);
    },
    sendStreamThreadRequest: (payload: StreamThreadRequestPayload) => {
      this.starts.push(payload);
    },
  };

  addMessageListener(
    message: "receiveStreamThreadResponse",
    listener: ResponseListener
  ) {
    expect(message).toBe("receiveStreamThreadResponse");
    this._listeners.add(listener);
  }

  removeMessageListener(
    message: "receiveStreamThreadResponse",
    listener: ResponseListener
  ) {
    expect(message).toBe("receiveStreamThreadResponse");
    this._listeners.delete(listener);
  }

  reset() {
    this.aborts.length = 0;
    this.envRequests.length = 0;
    this.mcpRequests.length = 0;
    this.searchRequests.length = 0;
    this.skillListRequests.length = 0;
    this.skillSettingsRequests.length = 0;
    this.starts.length = 0;
    this._listeners.clear();
  }
}

const RPC = new ControllableRpc();

await mock.module("@/lib/electrobun", () => ({
  electrobun: { rpc: RPC },
}));

const MODEL_PROVIDER_PATH = new URL(
  "../../../../packages/ui/src/components/model-provider.tsx",
  import.meta.url
).pathname;
await mock.module(MODEL_PROVIDER_PATH, () => ({
  useDefaultTextGenerationModel: () => null,
}));

const { CommandProvider } = await import("@/commands");
const { DesktopHostProvider } = await import("./host-services");
const { useHostServices } = await import("@llm-space/ui/host");
const { useStreamText } = await import(
  "../../../../packages/ui/src/components/thread-playground/use-stream-text"
);
const { bindProjectGenerationRuntime } = await import(
  "../../../../packages/ui/src/components/thread-playground/codegen/project-generation-runtime"
);

const REMOTE_RUNTIME: RuntimeId = "remote:auxiliary-generation";
const EMPTY_THREAD: Thread = { context: { messages: [] } };

interface CapturedTextGeneration {
  abort(): void;
  run(): Promise<void>;
}

function _captureHost(): HostServices {
  let captured: HostServices | null = null;

  function CaptureHost() {
    captured = useHostServices();
    return null;
  }

  renderToStaticMarkup(
    <CommandProvider>
      <DesktopHostProvider>
        <CaptureHost />
      </DesktopHostProvider>
    </CommandProvider>
  );

  if (!captured) {
    throw new Error("Desktop host was not rendered");
  }
  return captured;
}

function _model(provider: string): ModelConfig {
  return { provider, id: `${provider}-model` };
}

function _captureTextGeneration(
  workflow: "prompt" | "function-tool",
  runtimeId: RuntimeId
): CapturedTextGeneration {
  let captured: CapturedTextGeneration | null = null;
  const store = createThreadStore(EMPTY_THREAD, { runtimeId });
  const model = _model(`${runtimeId}-${workflow}`);

  function PromptHarness() {
    captured = useStreamText({
      systemPrompt: "Generate a system prompt",
      model,
    });
    return null;
  }

  function ToolHarness() {
    captured = useStreamText({
      systemPrompt: "Generate a function tool",
      model,
    });
    return null;
  }

  renderToStaticMarkup(
    <CommandProvider>
      <DesktopHostProvider>
        <ThreadStoreContext.Provider value={store}>
          {workflow === "prompt" ? <PromptHarness /> : <ToolHarness />}
        </ThreadStoreContext.Provider>
      </DesktopHostProvider>
    </CommandProvider>
  );

  if (!captured) {
    throw new Error(`${workflow} generation hook was not rendered`);
  }
  return captured;
}

async function _captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("Expected promise to reject");
  } catch (error) {
    return error;
  }
}

describe("Desktop auxiliary generation runtime scope", () => {
  beforeEach(() => {
    RPC.reset();
  });

  test.each(["prompt", "function-tool"] as const)(
    "%s consumer keeps its real hook run and abort bound to the owning runtime",
    async (workflow) => {
      const remoteGeneration = _captureTextGeneration(
        workflow,
        REMOTE_RUNTIME
      );
      const remoteRun = remoteGeneration.run();
      await Promise.resolve();
      const remoteStart = RPC.starts[0];

      expect(remoteStart).toMatchObject({
        runtimeId: REMOTE_RUNTIME,
        request: {
          model: {
            provider: `${REMOTE_RUNTIME}-${workflow}`,
            id: `${REMOTE_RUNTIME}-${workflow}-model`,
          },
        },
      });

      // Render and actually start the corresponding local consumer to model a
      // workspace switch. The already-running remote hook must keep its scope.
      const localGeneration = _captureTextGeneration(workflow, "local");
      const localRun = localGeneration.run();
      await Promise.resolve();
      expect(RPC.starts[1]).toMatchObject({ runtimeId: "local" });

      remoteGeneration.abort();
      await remoteRun;
      expect(RPC.aborts[0]).toEqual({
        runtimeId: REMOTE_RUNTIME,
        streamId: remoteStart?.streamId,
      });

      localGeneration.abort();
      await localRun;
      expect(RPC.aborts[1]).toEqual({
        runtimeId: "local",
        streamId: RPC.starts[1]?.streamId,
      });
    }
  );

  test("project orchestration binds transport and every runtime-sensitive host call", async () => {
    const host = _captureHost();
    if (!host.generator) {
      throw new Error("Desktop host did not provide generator services");
    }
    const remote = bindProjectGenerationRuntime({
      runtimeId: REMOTE_RUNTIME,
      createTransport: host.createTransport,
      skills: host.skills,
      mcp: host.mcp,
      generator: host.generator,
    });
    if (!remote) {
      throw new Error("Desktop host did not provide a project transport");
    }

    await remote.listEnabledSkills();
    await remote.listMcpServers();
    await remote.getSearchSettings();
    await remote.resolveEnv("remote-provider", ["REMOTE_SEARCH_KEY"]);

    const remoteController = new AbortController();
    const remoteRun = createOneShotRunner({ transport: remote.transport })({
      systemPrompt: "Write a project plan",
      userPrompt: "Generate the project",
      model: _model("remote-project"),
      signal: remoteController.signal,
    });
    await Promise.resolve();
    const remoteStart = RPC.starts[0];

    expect(remoteStart).toMatchObject({
      runtimeId: REMOTE_RUNTIME,
      request: { model: { provider: "remote-project" } },
    });
    expect(RPC.skillSettingsRequests).toEqual([
      { runtimeId: REMOTE_RUNTIME },
    ]);
    expect(RPC.skillListRequests).toEqual([
      { runtimeId: REMOTE_RUNTIME, path: "/remote/skills" },
    ]);
    expect(RPC.mcpRequests).toEqual([{ runtimeId: REMOTE_RUNTIME }]);
    expect(RPC.searchRequests).toEqual([{ runtimeId: REMOTE_RUNTIME }]);
    expect(RPC.envRequests).toEqual([
      {
        runtimeId: REMOTE_RUNTIME,
        providerId: "remote-provider",
        envNames: ["REMOTE_SEARCH_KEY"],
      },
    ]);

    // Use a new local project scope after the remote run starts. It may serve
    // new work, but cannot change the transport retained by the remote run.
    const local = bindProjectGenerationRuntime({
      runtimeId: "local",
      createTransport: host.createTransport,
      skills: host.skills,
      mcp: host.mcp,
      generator: host.generator,
    });
    if (!local) {
      throw new Error("Desktop host did not provide a local project transport");
    }
    await local.getSearchSettings();

    remoteController.abort();
    expect(await _captureRejection(remoteRun)).toMatchObject({
      name: "AbortError",
    });
    expect(RPC.aborts).toEqual([
      {
        runtimeId: REMOTE_RUNTIME,
        streamId: remoteStart?.streamId,
      },
    ]);
  });
});
