import { createModels } from "@earendil-works/pi-ai";
import { describe, expect, test } from "bun:test";

import { openaiCodexProvider } from "./openai-codex";

describe("openaiCodexProvider", () => {
  test("resolves the Codex CLI access token passed as an API-key override", async () => {
    const provider = openaiCodexProvider();
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
});
