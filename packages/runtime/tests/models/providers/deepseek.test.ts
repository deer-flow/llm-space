import { describe, expect, test } from "bun:test";

import { deepseekProvider } from "../../../src/models/providers/deepseek";

describe("DeepSeek mixed API provider", () => {
  test("routes V4.1 Flash and V4 Pro through Responses", () => {
    const models = deepseekProvider().getModels();
    const flash = models.find((model) => model.id === "deepseek-flash");
    const pro = models.find((model) => model.id === "deepseek-v4-pro");

    expect(flash?.api).toBe("openai-responses");
    expect(pro?.api).toBe("openai-responses");
    expect(
      models.filter((model) => model.id === "deepseek-flash")
    ).toHaveLength(1);
    expect(
      models.filter((model) => model.id === "deepseek-v4-pro")
    ).toHaveLength(1);
    expect(flash).toMatchObject({
      input: ["text", "image"],
      contextWindow: 1_000_000,
      maxTokens: 384_000,
      cost: {
        input: 0.3,
        output: 1.2,
        cacheRead: 0.006,
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
        input: 1.32,
        output: 3.96,
        cacheRead: 0.044,
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
