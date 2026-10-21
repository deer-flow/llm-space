import { describe, expect, test } from "bun:test";

import {
  firstAvailableModel,
  resolveModelConfig,
  selectableModels,
} from "../../src/thread/model-config";
import type { ModelProviderGroup } from "../../src/types";

function group(ids: string[], builtin = true): ModelProviderGroup {
  return {
    id: "gateway",
    name: "Gateway",
    builtin,
    profiles: [],
    models: ids.map((id) => ({
      id,
      name: id,
      provider: "gateway",
      api: "openai-completions",
      baseUrl: "https://example.com/v1",
      input: ["text"],
      reasoning: false,
      contextWindow: 1000000,
      maxTokens: 128000,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    })),
  };
}

const ids = [
  "other-model",
  "minimax/MiniMax-M3",
  "minimax/MiniMax-M2.7",
  "minimax/MiniMax-M3.1-Flash",
  "MiniMax-Text-01",
  "image-01",
];

describe("MiniMax new selections", () => {
  test("offers Flash first and M3 without moving unrelated or media models", () => {
    const provider = group(ids);
    expect(selectableModels(provider).map((model) => model.id)).toEqual([
      "other-model",
      "minimax/MiniMax-M3.1-Flash",
      "minimax/MiniMax-M3",
      "image-01",
    ]);
    expect(provider.models.map((model) => model.id)).toEqual(ids);
  });

  test("preserves saved IDs, defaults and request params", () => {
    const provider = group(ids);
    const saved = {
      provider: "gateway",
      id: "minimax/MiniMax-M2.7",
      params: { temperature: 0.2 },
    };
    expect(resolveModelConfig([provider], saved, null)).toBe(saved);
    expect(resolveModelConfig([provider], null, saved)).toBe(saved);
  });

  test("preserves custom providers and custom overrides", () => {
    expect(selectableModels(group(ids, false)).map((model) => model.id)).toEqual(ids);
    const provider = group(ids);
    provider.customModels = ["minimax/MiniMax-M2.7"];
    expect(selectableModels(provider).some((model) => model.id === ids[2])).toBe(true);
  });

  test("uses Flash for automatic selection and respects disabled models", () => {
    const provider = group(["MiniMax-M2.7", "MiniMax-M3", "MiniMax-M3.1-Flash"]);
    expect(firstAvailableModel([provider])?.id).toBe("MiniMax-M3.1-Flash");
    provider.disabledModels = ["MiniMax-M3.1-Flash"];
    expect(firstAvailableModel([provider])?.id).toBe("MiniMax-M3");
    provider.disabledModels.push("MiniMax-M3");
    expect(firstAvailableModel([provider])).toBeNull();
  });

  test("keeps existing free gateway routes verbatim", () => {
    for (const id of ["minimax/minimax-m3.1-flash:free", "minimax-m3.1-flash-free"]) {
      expect(selectableModels(group(["minimax-m3", id])).map((model) => model.id))
        .toEqual([id, "minimax-m3"]);
    }
  });

  test("does not invent a Flash route for gateways without it", () => {
    expect(selectableModels(group(["minimax-m2.7", "minimax-m3"]))
      .map((model) => model.id)).toEqual(["minimax-m3"]);
  });
});
