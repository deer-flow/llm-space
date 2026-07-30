import { describe, expect, test } from "bun:test";

import { createModels } from "@earendil-works/pi-ai";

import { openaiCodexProvider } from "./openai-codex";

describe("openaiCodexProvider", () => {
  test("resolves the Codex CLI access token passed as an API-key override", async () => {
    const provider = openaiCodexProvider(null);
    const model = provider.getModels()[0];
    const models = createModels();
    models.setProvider(provider);

    expect(provider.auth.oauth).toBeDefined();
    expect(await models.getAuth(model)).toBeUndefined();

    const auth = await models.getAuth(model, {
      apiKey: "codex-cli-access-token",
    });

    expect(auth?.auth.apiKey).toBe("codex-cli-access-token");
  });

  test("uses the configured endpoint and API for API key credentials", async () => {
    const provider = openaiCodexProvider({
      api: "anthropic-messages",
      apiKey: "codex-cli-api-key",
      baseUrl: "https://proxy.example.com",
      mode: "apiKey",
    });
    const model = provider.getModels()[0];

    expect(provider.auth.oauth).toBeUndefined();
    expect(provider.baseUrl).toBe("https://proxy.example.com");
    expect(model?.api).toBe("anthropic-messages");
    expect(model?.baseUrl).toBe("https://proxy.example.com");

    const auth = await provider.auth.apiKey?.resolve({
      ctx: {
        env: () => Promise.resolve(undefined),
        fileExists: () => Promise.resolve(false),
      },
    });
    expect(auth).toMatchObject({
      auth: { apiKey: "codex-cli-api-key" },
      source: "Codex CLI API key",
    });
  });
});
