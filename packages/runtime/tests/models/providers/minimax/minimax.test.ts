import { describe, expect, test } from "bun:test";

import { minimaxProvider } from "../../../../src/models/providers/minimax";
import { minimaxCnProvider } from "../../../../src/models/providers/minimax-cn";

const MODELS = ["MiniMax-M3", "MiniMax-M2.7"] as const;

describe("minimaxProvider", () => {
  test("exposes the OpenAI-compatible global endpoint and the M3/M2.7 models", () => {
    const provider = minimaxProvider();
    const models = provider.getModels();

    expect(provider.id).toBe("minimax");
    expect(provider.baseUrl).toBe("https://api.minimax.io/v1");
    expect(models.map((model) => model.id).sort()).toEqual([...MODELS].sort());

    const m3 = models.find((model) => model.id === "MiniMax-M3");
    expect(m3).toBeDefined();
    expect(m3?.api).toBe("openai-completions");
    expect(m3?.baseUrl).toBe("https://api.minimax.io/v1");
    expect(m3?.provider).toBe("minimax");
    // MiniMax-M3 accepts text, image, and video input.
    expect(m3?.input.map(String)).toEqual(["text", "image", "video"]);
    expect(m3?.contextWindow).toBe(1000000);
    expect(m3?.cost).toEqual({
      input: 0.6,
      output: 2.4,
      cacheRead: 0.12,
      cacheWrite: 0,
    });
  });
});

describe("minimaxCnProvider", () => {
  test("targets the China OpenAI-compatible endpoint for the same models", () => {
    const provider = minimaxCnProvider();
    const models = provider.getModels();

    expect(provider.id).toBe("minimax-cn");
    expect(provider.baseUrl).toBe("https://api.minimaxi.com/v1");
    expect(models.map((model) => model.id).sort()).toEqual([...MODELS].sort());

    for (const model of models) {
      expect(model.provider).toBe("minimax-cn");
      expect(model.baseUrl).toBe("https://api.minimaxi.com/v1");
    }
  });
});
