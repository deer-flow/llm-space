import { describe, expect, test } from "bun:test";

import type { ModelProviderGroup, Thread } from "@llm-space/core";

import { buildSharedThread } from "./share-thread";

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
