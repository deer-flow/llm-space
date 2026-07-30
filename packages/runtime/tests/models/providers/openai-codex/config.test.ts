import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { getCodexCredentials } from "../../../../src/models/providers/openai-codex";

const TEMP_DIRS: string[] = [];

afterEach(() => {
  for (const dir of TEMP_DIRS.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("getCodexCredentials", () => {
  test("prefers OAuth credentials", () => {
    const codexDir = _createCodexDir();
    writeFileSync(
      path.join(codexDir, "auth.json"),
      JSON.stringify({
        OPENAI_API_KEY: "api-key",
        tokens: { access_token: "oauth-token" },
      })
    );

    expect(getCodexCredentials(codexDir)).toEqual({
      apiKey: "oauth-token",
      mode: "oauth",
    });
  });

  test("loads the active API key provider", () => {
    const codexDir = _createCodexDir();
    writeFileSync(
      path.join(codexDir, "auth.json"),
      JSON.stringify({ OPENAI_API_KEY: "api-key" })
    );
    writeFileSync(
      path.join(codexDir, "config.toml"),
      [
        'model_provider = "proxy"',
        "",
        "[model_providers.proxy]",
        'base_url = "https://proxy.example.com"',
        'wire_api = "completions"',
      ].join("\n")
    );

    expect(getCodexCredentials(codexDir)).toEqual({
      api: "openai-completions",
      apiKey: "api-key",
      baseUrl: "https://proxy.example.com",
      mode: "apiKey",
    });
  });
});

function _createCodexDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "llm-space-codex-"));
  TEMP_DIRS.push(dir);
  return dir;
}
