import { describe, expect, test } from "bun:test";

import { deepseekProvider } from "../../../../src/models/providers/deepseek";

describe("deepseekProvider", () => {
  test("exposes the DeepSeek endpoint with the upstream models plus the V4.1 Flash preview", () => {
    const provider = deepseekProvider();
    const models = provider.getModels();

    expect(provider.id).toBe("deepseek");
    expect(provider.baseUrl).toBe("https://api.deepseek.com");

    const ids = models.map((model) => model.id);
    expect(ids).toContain("deepseek-v4-flash");
    expect(ids).toContain("deepseek-v4-pro");
    expect(ids).toContain("deepseek-v4.1-flash-expires-on-0910");
  });

  test("the V4.1 Flash preview is multimodal, 1M-context, and priced like V4 Flash", () => {
    const provider = deepseekProvider();
    const preview = provider
      .getModels()
      .find((model) => model.id === "deepseek-v4.1-flash-expires-on-0910");
    expect(preview).toBeDefined();
    expect(preview?.api).toBe("openai-completions");
    expect(preview?.baseUrl).toBe("https://api.deepseek.com");
    expect(preview?.provider).toBe("deepseek");
    // Native multimodal input (new V4.1 architecture).
    expect(preview?.input.map(String)).toEqual(["text", "image"]);
    expect(preview?.reasoning).toBe(true);
    expect(preview?.contextWindow).toBe(1_000_000);
    // Same billing as deepseek-v4-flash.
    expect(preview?.cost).toEqual({
      input: 0.14,
      output: 0.28,
      cacheRead: 0.0028,
      cacheWrite: 0,
    });
    expect(preview?.compat).toMatchObject({
      maxTokensField: "max_tokens",
      requiresReasoningContentOnAssistantMessages: true,
      thinkingFormat: "deepseek",
    });
  });

  test("keeps the Responses-API override for V4 Flash/Pro", () => {
    const provider = deepseekProvider();
    const models = provider.getModels();
    const flash = models.find((model) => model.id === "deepseek-v4-flash");
    const pro = models.find((model) => model.id === "deepseek-v4-pro");
    expect(flash?.api).toBe("openai-responses");
    expect(pro?.api).toBe("openai-responses");
    expect(flash?.contextWindow).toBe(1_000_000);
  });
});
