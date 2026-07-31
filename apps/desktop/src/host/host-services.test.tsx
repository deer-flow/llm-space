import { beforeEach, describe, expect, mock, test } from "bun:test";

import {
  streamThread,
  type AgentTransport,
  type ModelConfig,
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

type ResponseListener = (message: StreamThreadResponsePayload) => void;

class ControllableRpc {
  readonly aborts: AbortStreamThreadPayload[] = [];
  readonly envRequests: Record<string, unknown>[] = [];
  readonly searchRequests: Record<string, unknown>[] = [];
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
    this.searchRequests.length = 0;
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

function _model(provider: string, id: string): ModelConfig {
  return { provider, id };
}

function _startTextGeneration(
  transport: AgentTransport,
  model: ModelConfig,
  signal: AbortSignal
): Promise<unknown> {
  const iterator = streamThread(
    {
      context: {
        messages: [
          {
            id: "user-message",
            role: "user",
            content: [{ type: "text", text: "Generate the artifact" }],
          },
        ],
      },
      model,
    },
    { signal, transport }
  )[Symbol.asyncIterator]();
  return iterator.next();
}

function _startProjectGeneration(
  transport: AgentTransport,
  model: ModelConfig,
  signal: AbortSignal
): Promise<unknown> {
  return createOneShotRunner({ transport })({
    systemPrompt: "Write a project plan",
    userPrompt: "Generate the artifact",
    model,
    signal,
  });
}

async function _captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("Expected promise to reject");
  } catch (error) {
    return error;
  }
}

const WORKFLOWS = [
  { name: "prompt", start: _startTextGeneration },
  { name: "function tool", start: _startTextGeneration },
  { name: "project", start: _startProjectGeneration },
] as const;

describe("DesktopHostProvider auxiliary generation transports", () => {
  beforeEach(() => {
    RPC.reset();
  });

  for (const workflow of WORKFLOWS) {
    test(`${workflow.name} generation keeps start and abort bound to its owning runtime`, async () => {
      const host = _captureHost();
      expect(typeof host.createTransport).toBe("function");

      const localController = new AbortController();
      const remoteController = new AbortController();
      const localModel = _model(
        `local-${workflow.name.replace(" ", "-")}`,
        "local-model"
      );
      const remoteModel = _model(
        `remote-${workflow.name.replace(" ", "-")}`,
        "remote-model"
      );
      const localTransport = host.createTransport("local");
      const remoteTransport = host.createTransport(REMOTE_RUNTIME);
      if (!localTransport || !remoteTransport) {
        throw new Error("Desktop host did not provide generation transports");
      }

      const localRun = workflow.start(
        localTransport,
        localModel,
        localController.signal
      );
      const remoteRun = workflow.start(
        remoteTransport,
        remoteModel,
        remoteController.signal
      );
      await Promise.resolve();

      expect(
        RPC.starts.map(({ runtimeId, request }) => ({
          runtimeId,
          provider: request.model.provider,
          modelId: request.model.id,
        }))
      ).toEqual([
        {
          runtimeId: "local",
          provider: localModel.provider,
          modelId: localModel.id,
        },
        {
          runtimeId: REMOTE_RUNTIME,
          provider: remoteModel.provider,
          modelId: remoteModel.id,
        },
      ]);

      // Simulate a workspace/tab switch after the remote run has started. A
      // fresh local transport must not change the scope retained by its abort.
      host.createTransport("local");
      remoteController.abort();
      expect(await _captureRejection(remoteRun)).toMatchObject({
        name: "AbortError",
      });
      expect(RPC.aborts).toEqual([
        {
          runtimeId: REMOTE_RUNTIME,
          streamId: RPC.starts[1]?.streamId,
        },
      ]);

      localController.abort();
      expect(await _captureRejection(localRun)).toMatchObject({
        name: "AbortError",
      });
      expect(RPC.aborts[1]).toEqual({
        runtimeId: "local",
        streamId: RPC.starts[0]?.streamId,
      });
    });
  }

  test("project generation resolves model and search credentials in its owning runtime", async () => {
    const generator = _captureHost().generator;
    if (!generator) {
      throw new Error("Desktop host did not provide generator services");
    }

    await generator.getSearchSettings({ runtimeId: REMOTE_RUNTIME });
    await generator.resolveEnv("remote-provider", ["REMOTE_SEARCH_KEY"], {
      runtimeId: REMOTE_RUNTIME,
    });

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
