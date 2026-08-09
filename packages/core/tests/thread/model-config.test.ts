import { describe, expect, test } from "bun:test";

import {
  firstAvailableModel,
  isModelAvailable,
  resolveModelConfig,
} from "../../src/thread/model-config";
import type { ModelProviderGroup } from "../../src/types";


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
    id: "z-provider",
    name: "Z Provider",
    profiles: [],
    models: [
      _model("z-provider", "disabled", "Disabled"),
      _model("z-provider", "z-model", "Z Model"),
    ],
    disabledModels: ["disabled"],
  },
  {
    id: "a-provider",
    name: "A Provider",
    profiles: [],
    models: [_model("a-provider", "a-model", "A Model")],
  },
] satisfies ModelProviderGroup[];

describe("model config resolution", () => {
  test("uses provider display order and skips disabled models", () => {
    expect(firstAvailableModel(PROVIDERS)).toEqual({
      provider: "a-provider",
      id: "a-model",
    });
    expect(
      isModelAvailable(PROVIDERS, {
        provider: "z-provider",
        id: "disabled",
      })
    ).toBe(false);
  });

  test("prefers an available saved model and preserves its params", () => {
    const saved = {
      provider: "z-provider",
      id: "z-model",
      params: { temperature: 0.2 },
    };
    expect(
      resolveModelConfig(PROVIDERS, saved, {
        provider: "a-provider",
        id: "a-model",
      })
    ).toBe(saved);
  });

  test("falls back through the default model to the first available model", () => {
    expect(
      resolveModelConfig(PROVIDERS, undefined, {
        provider: "z-provider",
        id: "z-model",
      })
    ).toEqual({ provider: "z-provider", id: "z-model" });
    expect(
      resolveModelConfig(PROVIDERS, undefined, {
        provider: "missing",
        id: "missing",
      })
    ).toEqual({ provider: "a-provider", id: "a-model" });
  });
});
