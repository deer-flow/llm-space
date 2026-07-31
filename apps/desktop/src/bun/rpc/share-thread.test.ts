import { describe, expect, test } from "bun:test";

import type { ModelProviderGroup, Thread } from "@llm-space/core";
import { RuntimeRouter, type RuntimeClient } from "@llm-space/runtime/runtime";

import { buildSharedThread, createShareThreadHandler } from "./share-thread";

function _model(
  provider: string,
  id: string,
  name: string
): ModelProviderGroup["models"][number] {
  return {
    provider,
    id,
    name,
    api: "openai-completions" as const,
    baseUrl: "https://example.com",
    reasoning: false,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 16_384,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

const PROVIDERS = [
  {
    id: "provider",
    name: "Provider",
    models: [_model("provider", "default-model", "Default Model")],
  },
] satisfies ModelProviderGroup[];

describe("buildSharedThread", () => {
  test("freezes the resolved default model and display name into the copy", () => {
    const thread: Thread = { title: "Local" };
    const shared = buildSharedThread(
      thread,
      PROVIDERS,
      { provider: "provider", id: "default-model" },
      "Shared"
    );

    expect(shared).toEqual({
      title: "Shared",
      model: { provider: "provider", id: "default-model" },
      modelName: "Default Model",
    });
    expect(thread).toEqual({ title: "Local" });
  });

  test("uses the first available model when the default is automatic", () => {
    expect(buildSharedThread({}, PROVIDERS, null)).toMatchObject({
      model: { provider: "provider", id: "default-model" },
      modelName: "Default Model",
    });
  });

  test("preserves an unresolved saved model for a useful viewer fallback", () => {
    const thread: Thread = {
      model: { provider: "missing", id: "legacy-model" },
    };
    expect(buildSharedThread(thread, [], null)).toEqual(thread);
  });
});

function _runtime(input: {
  id: "local" | `remote:${string}`;
  status?: "connected" | "disconnected";
  thread: Thread;
  providers: ModelProviderGroup[];
  defaultModel: { provider: string; id: string } | null;
}): RuntimeClient {
  return {
    info: () => ({
      id: input.id,
      kind: input.id === "local" ? "local" : "remote",
      name: input.id,
      status: input.status ?? "connected",
      capabilities: ["filesystem", "models"],
    }),
    fsRead: () => Promise.resolve(structuredClone(input.thread)),
    availableModels: () => Promise.resolve(structuredClone(input.providers)),
    getDefaultModel: () => Promise.resolve(structuredClone(input.defaultModel)),
  } as unknown as RuntimeClient;
}

function _handlerFixture(input?: {
  remoteStatus?: "connected" | "disconnected";
}) {
  const localProviders = [
    {
      id: "local-provider",
      name: "Local Provider",
      models: [_model("local-provider", "local-model", "Local Model")],
    },
  ] satisfies ModelProviderGroup[];
  const remoteProviders = [
    {
      id: "remote-provider",
      name: "Remote Provider",
      models: [_model("remote-provider", "remote-model", "Remote Model")],
    },
  ] satisfies ModelProviderGroup[];
  const local = _runtime({
    id: "local",
    thread: {
      title: "Local same-path thread",
      context: { systemPrompt: "LOCAL PRIVATE CONTENT" },
    },
    providers: localProviders,
    defaultModel: { provider: "local-provider", id: "local-model" },
  });
  const remote = _runtime({
    id: "remote:alpha",
    status: input?.remoteStatus,
    thread: {
      title: "Remote same-path thread",
      context: { systemPrompt: "REMOTE SELECTED CONTENT" },
    },
    providers: remoteProviders,
    defaultModel: { provider: "remote-provider", id: "remote-model" },
  });
  const router = new RuntimeRouter(local);
  router.register("remote:alpha", remote);
  const resolvedRuntimeIds: string[] = [];
  const writes: {
    thread: Thread;
    description: string | undefined;
  }[] = [];
  const handler = createShareThreadHandler({
    getRuntime: (runtimeId) => {
      resolvedRuntimeIds.push(runtimeId);
      return router.get(runtimeId);
    },
    gistWriter: {
      write: (thread, _id, options) => {
        writes.push({
          thread: structuredClone(thread),
          description: options?.description,
        });
        return Promise.resolve({
          id: "gist-remote",
          filename: "thread.json",
        });
      },
    },
  });
  return { handler, resolvedRuntimeIds, writes, router };
}

describe("createShareThreadHandler", () => {
  test("publishes thread content and model metadata only from the selected remote runtime", async () => {
    const { handler, resolvedRuntimeIds, writes } = _handlerFixture();

    const result = await handler({
      runtimeId: "remote:alpha",
      path: "threads/same.json",
      title: "Shared remote title",
      description: "Remote description",
    });

    expect(result).toEqual({
      gistId: "gist-remote",
      shareUrl:
        "https://deer-flow.github.io/llm-space/#/shared/gist/threads/gist-remote",
    });
    expect(resolvedRuntimeIds).toEqual(["remote:alpha"]);
    expect(writes).toEqual([
      {
        description: "Remote description",
        thread: {
          title: "Shared remote title",
          context: { systemPrompt: "REMOTE SELECTED CONTENT" },
          model: { provider: "remote-provider", id: "remote-model" },
          modelName: "Remote Model",
        },
      },
    ]);
    expect(JSON.stringify(writes)).not.toContain("LOCAL PRIVATE CONTENT");
    expect(JSON.stringify(writes)).not.toContain("Local Model");
  });

  test("shares a remote-only path without consulting local storage", async () => {
    const { handler, router, resolvedRuntimeIds, writes } = _handlerFixture();
    const local = router.get("local");
    local.fsRead = () => Promise.reject(new Error("local path does not exist"));

    await handler({
      runtimeId: "remote:alpha",
      path: "remote-only.json",
    });

    expect(resolvedRuntimeIds).toEqual(["remote:alpha"]);
    expect(writes[0]?.thread.context?.systemPrompt).toBe(
      "REMOTE SELECTED CONTENT"
    );
  });

  test("preserves local sharing when local is explicitly selected", async () => {
    const { handler, resolvedRuntimeIds, writes } = _handlerFixture();

    await handler({ runtimeId: "local", path: "threads/same.json" });

    expect(resolvedRuntimeIds).toEqual(["local"]);
    expect(writes[0]?.thread).toMatchObject({
      title: "Local same-path thread",
      context: { systemPrompt: "LOCAL PRIVATE CONTENT" },
      model: { provider: "local-provider", id: "local-model" },
      modelName: "Local Model",
    });
  });

  test("reports a missing runtime instead of falling back to local", async () => {
    const { handler, writes } = _handlerFixture();

    let thrown: unknown;
    try {
      await handler({
        runtimeId: "remote:missing",
        path: "threads/same.json",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(
      "Runtime not found: remote:missing"
    );
    expect(writes).toEqual([]);
  });

  test("reports a disconnected runtime before reading or publishing", async () => {
    const { handler, resolvedRuntimeIds, writes } = _handlerFixture({
      remoteStatus: "disconnected",
    });

    let thrown: unknown;
    try {
      await handler({ runtimeId: "remote:alpha", path: "threads/same.json" });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(
      "Runtime is not connected: remote:alpha"
    );
    expect(resolvedRuntimeIds).toEqual(["remote:alpha"]);
    expect(writes).toEqual([]);
  });
});
