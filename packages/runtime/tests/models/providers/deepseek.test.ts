import { describe, expect, test } from "bun:test";

import { deepseekProvider } from "../../../src/models/providers/deepseek";

describe("DeepSeek mixed API provider", () => {
  test("routes V4 Flash and V4 Pro through Responses", () => {
    const models = deepseekProvider().getModels();
    const flash = models.find((model) => model.id === "deepseek-v4-flash");
    const pro = models.find((model) => model.id === "deepseek-v4-pro");

    expect(flash?.api).toBe("openai-responses");
    expect(pro?.api).toBe("openai-responses");
    expect(
      models.filter((model) => model.id === "deepseek-v4-flash")
    ).toHaveLength(1);
    expect(
      models.filter((model) => model.id === "deepseek-v4-pro")
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
    expect(pro).toMatchObject({
      input: ["text"],
      contextWindow: 1_000_000,
      maxTokens: 384_000,
      cost: {
        input: 0.435,
        output: 0.87,
        cacheRead: 0.003625,
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
