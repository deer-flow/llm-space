import { describe, expect, test } from "bun:test";

import { aliyunQwenProvider } from "../../../src/models/providers/aliyun-qwen";

const MODEL_IDS = [
  "qwen3.8-max",
  "qwen3.7-plus",
  "qwen3.8-flash",
  "deepseek-v4-pro-0813",
  "deepseek-v4-flash-0731",
  "kimi-k3",
  "glm-5.3",
  "MiniMax-M3",
] as const;

describe("aliyunQwenProvider", () => {
  test("uses DashScope and exposes the featured model catalog", async () => {
    const provider = aliyunQwenProvider();
    const models = provider.getModels();

    expect(provider.id).toBe("aliyun-qwen");
    expect(provider.name).toBe("Aliyun Qwen");
    expect(provider.baseUrl).toBe(
      "https://dashscope.aliyuncs.com/compatible-mode/v1"
    );
    expect(models.map((model) => model.id)).toEqual([...MODEL_IDS]);

    const auth = await provider.auth.apiKey?.resolve({
      credential: undefined,
      ctx: {
        env: (name) =>
          Promise.resolve(name === "DASHSCOPE_API_KEY" ? "dashscope-key" : undefined),
        fileExists: () => Promise.resolve(false),
      },
      signal: new AbortController().signal,
    });
    expect(auth?.auth.apiKey).toBe("dashscope-key");
    expect(auth?.source).toBe("DASHSCOPE_API_KEY");
  });

  test("records the model capabilities and limits", () => {
    const models = new Map(
      aliyunQwenProvider()
        .getModels()
        .map((model) => [model.id, model])
    );

    for (const id of ["qwen3.8-max", "qwen3.7-plus", "qwen3.8-flash"]) {
      expect(models.get(id)).toMatchObject({
        input: ["text", "image"],
        reasoning: true,
        contextWindow: 1_000_000,
        maxTokens: 131_072,
      });
    }
    for (const id of ["deepseek-v4-pro-0813", "deepseek-v4-flash-0731"]) {
      expect(models.get(id)).toMatchObject({
        input: ["text"],
        reasoning: true,
        contextWindow: 1_000_000,
        maxTokens: 393_216,
      });
    }
    expect(models.get("kimi-k3")).toMatchObject({
      input: ["text", "image"],
      contextWindow: 1_048_576,
      maxTokens: 1_048_576,
    });
    expect(models.get("glm-5.3")).toMatchObject({
      input: ["text"],
      contextWindow: 1_048_576,
      maxTokens: 131_072,
    });
    expect(models.get("MiniMax-M3")).toMatchObject({
      input: ["text", "image"],
      contextWindow: 1_048_576,
      maxTokens: 131_072,
    });
  });
});
