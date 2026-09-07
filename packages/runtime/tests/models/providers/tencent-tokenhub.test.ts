import { describe, expect, test } from "bun:test";

import { tencentTokenHubProvider } from "../../../src/models/providers/tencent-tokenhub";

describe("tencentTokenHubProvider", () => {
  test("uses TokenHub Chat Completions and exposes only text/VLM models", () => {
    const provider = tencentTokenHubProvider();
    const models = provider.getModels();

    expect(provider.id).toBe("tencent-tokenhub");
    expect(provider.name).toBe("Tencent Token Hub");
    expect(provider.baseUrl).toBe("https://tokenhub.tencentmaas.com/v1");
    const modelIds = models.map((model) => model.id);
    expect(modelIds).toContain("hy4-preview");
    expect(
      [
        "hy-mt2-pro",
        "deepseek-v4-pro-202606",
        "glm-5.2",
        "kimi-k2.6",
        "minimax-m3",
        "qwen3.5-plus",
        "mimo-v2.5-pro",
        "hy-vision-2.0-instruct",
      ].every((id) => modelIds.includes(id))
    ).toBe(true);
    expect(models.every((model) => model.api === "openai-completions")).toBe(
      true
    );
    expect(
      models.every(
        (model) =>
          model.input.includes("text") &&
          model.input.every((input) => input === "text" || input === "image")
      )
    ).toBe(true);
    expect(
      models.some((model) =>
        /embedding|image-v3|video-v|3d/i.test(model.id)
      )
    ).toBe(false);
  });

  test("resolves both supported API key environment variables in order", async () => {
    const auth = tencentTokenHubProvider().auth.apiKey;
    const signal = new AbortController().signal;
    const resolve = (values: Record<string, string | undefined>) =>
      auth?.resolve({
        credential: undefined,
        ctx: {
          env: (name) => Promise.resolve(values[name]),
          fileExists: () => Promise.resolve(false),
        },
        signal,
      });

    const preferred = await resolve({
      TOKENHUB_API_KEY: "preferred-key",
      TOKEN_HUB_API_KEY: "fallback-key",
    });
    expect(preferred?.auth.apiKey).toBe("preferred-key");
    expect(preferred?.source).toBe("TOKENHUB_API_KEY");

    const fallback = await resolve({ TOKEN_HUB_API_KEY: "fallback-key" });
    expect(fallback?.auth.apiKey).toBe("fallback-key");
    expect(fallback?.source).toBe("TOKEN_HUB_API_KEY");
  });

  test("records Hy4 and VLM capabilities", () => {
    const models = new Map(
      tencentTokenHubProvider()
        .getModels()
        .map((model) => [model.id, model])
    );

    expect(models.get("hy4-preview")).toMatchObject({
      input: ["text"],
      reasoning: true,
      contextWindow: 1_024_000,
      maxTokens: 64_000,
    });
    for (const id of [
      "deepseek/deepseek-v4-flash-vision-exp",
      "glm-5v-turbo",
      "youtu-vita",
      "hy-vision-2.0-instruct",
      "hunyuan-t1-vision-20250916",
    ]) {
      expect(models.get(id)?.input).toEqual(["text", "image"]);
    }
  });
});
