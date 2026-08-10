import { describe, expect, mock, test } from "bun:test";
import { fileURLToPath } from "node:url";

import type {
  AgentStreamRequest,
  AgentTransport,
  ModelConfig,
  Thread,
} from "@llm-space/core";
import { createOneShotRunner } from "@llm-space/core/workflow";
import { renderToStaticMarkup } from "react-dom/server";

import { bindProjectGenerationRuntime } from "../../../src/components/thread-playground/codegen/project-generation-runtime";
import { createThreadStore, ThreadStoreContext } from "../../../src/components/thread-playground/stores/thread-store";
import {
  HostServicesProvider,
  type HostServices,
  type McpHost,
  type SkillsHost,
} from "../../../src/host";
import type { GeneratorHost } from "../../../src/host/types";


const MODEL_PROVIDER_PATH = fileURLToPath(
  new URL("../../../src/components/model-provider.tsx", import.meta.url)
);
await mock.module(MODEL_PROVIDER_PATH, () => ({
  useDefaultTextGenerationModel: () => null,
}));

const { useStreamText } = await import("../../../src/components/thread-playground/use-stream-text");

const REMOTE_RUNTIME = "remote:auxiliary-generation";
const EMPTY_THREAD: Thread = { context: { messages: [] } };

interface TransportAttempt {
  readonly runtimeId: string;
  readonly request: AgentStreamRequest;
  aborted: boolean;
}

interface CapturedTextGeneration {
  abort(): void;
  run(): Promise<void>;
}

function _model(provider: string): ModelConfig {
  return { provider, id: `${provider}-model` };
}

function _createTransportFactory(attempts: TransportAttempt[]) {
  return (runtimeId: string): AgentTransport =>
    async function* transport(request, { signal }) {
      const attempt: TransportAttempt = {
        runtimeId,
        request,
        aborted: false,
      };
      attempts.push(attempt);
      await new Promise<void>((resolve) => {
        const handleAbort = () => {
          attempt.aborted = true;
          resolve();
        };
        if (signal?.aborted) {
          handleAbort();
        } else {
          signal?.addEventListener("abort", handleAbort, { once: true });
        }
      });
      throw new DOMException("The operation was aborted", "AbortError");
    };
}

function _host(createTransport: HostServices["createTransport"]): HostServices {
  return { createTransport } as HostServices;
}

function _captureTextGeneration(
  workflow: "prompt" | "function-tool",
  runtimeId: string,
  createTransport: HostServices["createTransport"]
): CapturedTextGeneration {
  let captured: CapturedTextGeneration | null = null;
  const store = createThreadStore(EMPTY_THREAD, { runtimeId });

  function Harness() {
    captured = useStreamText({
      systemPrompt:
        workflow === "prompt"
          ? "Generate a system prompt"
          : "Generate a function tool",
      model: _model(`${runtimeId}-${workflow}`),
    });
    return null;
  }

  renderToStaticMarkup(
    <HostServicesProvider value={_host(createTransport)}>
      <ThreadStoreContext.Provider value={store}>
        <Harness />
      </ThreadStoreContext.Provider>
    </HostServicesProvider>
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

describe("auxiliary generation runtime ownership", () => {
  test.each(["prompt", "function-tool"] as const)(
    "%s generation retains its owner across a workspace switch and abort",
    async (workflow) => {
      const attempts: TransportAttempt[] = [];
      const createTransport = _createTransportFactory(attempts);
      const remoteGeneration = _captureTextGeneration(
        workflow,
        REMOTE_RUNTIME,
        createTransport
      );
      const remoteRun = remoteGeneration.run();
      await Promise.resolve();

      expect(attempts[0]).toMatchObject({
        runtimeId: REMOTE_RUNTIME,
        request: {
          model: {
            provider: `${REMOTE_RUNTIME}-${workflow}`,
            id: `${REMOTE_RUNTIME}-${workflow}-model`,
          },
        },
      });

      const localGeneration = _captureTextGeneration(
        workflow,
        "local",
        createTransport
      );
      const localRun = localGeneration.run();
      await Promise.resolve();
      expect(attempts[1]?.runtimeId).toBe("local");

      remoteGeneration.abort();
      await remoteRun;
      expect(attempts[0]?.aborted).toBe(true);

      localGeneration.abort();
      await localRun;
      expect(attempts[1]?.aborted).toBe(true);
    }
  );

  test("project generation binds transport and host calls to one owner", async () => {
    const attempts: TransportAttempt[] = [];
    const calls: { operation: string; runtimeId?: string }[] = [];
    const createTransport = _createTransportFactory(attempts);
    const skills: SkillsHost = {
      getSettings: async (options) => {
        calls.push({ operation: "skills.settings", ...options });
        return {
          discoveryPaths: [{ path: "/remote/skills", hiddenSkills: [] }],
        };
      },
      listAvailable: async (options) => {
        calls.push({ operation: "skills.available", ...options });
        return [];
      },
      listSkills: async (_path, options) => {
        calls.push({ operation: "skills.list", ...options });
        return [];
      },
    };
    const mcp: McpHost = {
      listServers: async (options) => {
        calls.push({ operation: "mcp.list", ...options });
        return [];
      },
      listTools: async (serverId, options) => {
        calls.push({ operation: "mcp.tools", ...options });
        return {
          server: {
            id: serverId,
            serverName: "fixture-server",
            name: "Fixture server",
            transport: "stdio",
            createdAt: 0,
            updatedAt: 0,
            connected: true,
            toolCount: 0,
          },
          tools: [],
        };
      },
    };
    const generator = {
      getSearchSettings: async (options) => {
        calls.push({ operation: "search.settings", ...options });
        return {
          provider: "firecrawl" as const,
          braveApiKey: "",
          firecrawlApiKey: "",
          tavilyApiKey: "",
        };
      },
      resolveEnv: async (_providerId, _envNames, options) => {
        calls.push({ operation: "generator.env", ...options });
        return { modelApiKey: "remote-secret", envValues: {} };
      },
    } as GeneratorHost;
    const remote = bindProjectGenerationRuntime({
      runtimeId: REMOTE_RUNTIME,
      createTransport,
      skills,
      mcp,
      generator,
    });
    if (!remote) {
      throw new Error("Project transport was not created");
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

    const local = bindProjectGenerationRuntime({
      runtimeId: "local",
      createTransport,
      skills,
      mcp,
      generator,
    });
    if (!local) {
      throw new Error("Local project transport was not created");
    }
    await local.getSearchSettings();

    remoteController.abort();
    expect(await _captureRejection(remoteRun)).toMatchObject({
      name: "AbortError",
    });
    expect(attempts[0]).toMatchObject({
      runtimeId: REMOTE_RUNTIME,
      aborted: true,
    });
    expect(calls.slice(0, 4)).toEqual([
      { operation: "skills.available", runtimeId: REMOTE_RUNTIME },
      { operation: "mcp.list", runtimeId: REMOTE_RUNTIME },
      { operation: "search.settings", runtimeId: REMOTE_RUNTIME },
      { operation: "generator.env", runtimeId: REMOTE_RUNTIME },
    ]);
    expect(calls[4]).toEqual({
      operation: "search.settings",
      runtimeId: "local",
    });
  });
});
