import { describe, expect, test } from "bun:test";

import { deepseekProvider } from "./deepseek";

describe("DeepSeek mixed API provider", () => {
  test("routes V4 Flash through Responses and keeps V4 Pro on Completions", () => {
    const models = deepseekProvider().getModels();
    const flash = models.find((model) => model.id === "deepseek-v4-flash");
    const pro = models.find((model) => model.id === "deepseek-v4-pro");

    expect(flash?.api).toBe("openai-responses");
    expect(pro?.api).toBe("openai-completions");
    expect(
      models.filter((model) => model.id === "deepseek-v4-flash")
    ).toHaveLength(1);
    expect(flash).toMatchObject({
      input: ["text"],
      contextWindow: 1_000_000,
      maxTokens: 384_000,
      cost: {
        input: 0.14,
        output: 0.28,
        cacheRead: 0.0028,
        cacheWrite: 0,
      },
      compat: {
        supportsDeveloperRole: false,
        supportsLongCacheRetention: false,
        sessionAffinityFormat: "openai-nosession",
      },
    });
  });
});
