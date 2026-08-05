import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { ModelConfig } from "@llm-space/core";
import { createOneShotRunner } from "@llm-space/core/workflow";
import type { HostServices } from "@llm-space/ui/host";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  AbortStreamThreadPayload,
  StreamThreadRequestPayload,
  StreamThreadResponsePayload,
} from "@/shared/rpc";
import type { RuntimeId } from "@/shared/runtime";

type ResponseListener = (message: StreamThreadResponsePayload) => void;

class ControllableRpc {
  readonly aborts: AbortStreamThreadPayload[] = [];
  readonly envRequests: Record<string, unknown>[] = [];
  readonly mcpRequests: Record<string, unknown>[] = [];
  readonly searchRequests: Record<string, unknown>[] = [];
  readonly skillAvailableRequests: Record<string, unknown>[] = [];
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
    skillsListAvailable: (payload: Record<string, unknown>) => {
      this.skillAvailableRequests.push(payload);
      return Promise.resolve([]);
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
    this.skillAvailableRequests.length = 0;
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

const { CommandProvider } = await import("@/commands");
const { DesktopHostProvider } = await import("./host-services");
const { useHostServices } = await import("@llm-space/ui/host");

const REMOTE_RUNTIME: RuntimeId = "remote:auxiliary-generation";

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

async function _captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("Expected promise to reject");
  } catch (error) {
    return error;
  }
}

describe("Desktop runtime-scoped host services", () => {
  beforeEach(() => {
    RPC.reset();
  });

  test("transport start and abort payloads keep their requested runtime", async () => {
    const host = _captureHost();
    const remoteTransport = host.createTransport(REMOTE_RUNTIME);
    if (!remoteTransport) {
      throw new Error("Desktop host did not provide a remote transport");
    }
    const remoteController = new AbortController();
    const remoteRun = createOneShotRunner({ transport: remoteTransport })({
      systemPrompt: "Write a remote project plan",
      userPrompt: "Generate the remote project",
      model: _model("remote-project"),
      signal: remoteController.signal,
    });
    await Promise.resolve();
    const remoteStart = RPC.starts[0];

    expect(remoteStart).toMatchObject({
      runtimeId: REMOTE_RUNTIME,
      request: { model: { provider: "remote-project" } },
    });

    const localTransport = host.createTransport("local");
    if (!localTransport) {
      throw new Error("Desktop host did not provide a local transport");
    }
    const localController = new AbortController();
    const localRun = createOneShotRunner({ transport: localTransport })({
      systemPrompt: "Write a local project plan",
      userPrompt: "Generate the local project",
      model: _model("local-project"),
      signal: localController.signal,
    });
    await Promise.resolve();

    expect(RPC.starts[1]).toMatchObject({ runtimeId: "local" });

    remoteController.abort();
    expect(await _captureRejection(remoteRun)).toMatchObject({
      name: "AbortError",
    });
    expect(RPC.aborts[0]).toEqual({
      runtimeId: REMOTE_RUNTIME,
      streamId: remoteStart?.streamId,
    });

    localController.abort();
    expect(await _captureRejection(localRun)).toMatchObject({
      name: "AbortError",
    });
    expect(RPC.aborts[1]).toEqual({
      runtimeId: "local",
      streamId: RPC.starts[1]?.streamId,
    });
  });

  test("runtime-sensitive host calls carry their explicit owner", async () => {
    const host = _captureHost();
    if (!host.generator) {
      throw new Error("Desktop host did not provide generator services");
    }

    await host.skills.getSettings({ runtimeId: REMOTE_RUNTIME });
    await host.skills.listAvailable({ runtimeId: REMOTE_RUNTIME });
    await host.skills.listSkills("/remote/skills", {
      runtimeId: REMOTE_RUNTIME,
    });
    await host.mcp.listServers({ runtimeId: REMOTE_RUNTIME });
    await host.generator.getSearchSettings({ runtimeId: REMOTE_RUNTIME });
    await host.generator.resolveEnv("remote-provider", ["REMOTE_SEARCH_KEY"], {
      runtimeId: REMOTE_RUNTIME,
    });

    expect(RPC.skillSettingsRequests).toEqual([{ runtimeId: REMOTE_RUNTIME }]);
    expect(RPC.skillAvailableRequests).toEqual([{ runtimeId: REMOTE_RUNTIME }]);
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
  });
});
