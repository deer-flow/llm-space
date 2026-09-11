import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { VercelTokenStore } from "./vercel-token-store";

const ORIGINAL_HOME = process.env.LLM_SPACE_HOME;
const TEMP_DIRS: string[] = [];

beforeEach(() => {
  const dir = path.join(os.tmpdir(), `llm-space-vercel-store-${Date.now()}`);
  TEMP_DIRS.push(dir);
  process.env.LLM_SPACE_HOME = dir;
});

afterEach(async () => {
  for (const dir of TEMP_DIRS.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
  if (ORIGINAL_HOME === undefined) {
    delete process.env.LLM_SPACE_HOME;
  } else {
    process.env.LLM_SPACE_HOME = ORIGINAL_HOME;
  }
});

describe("VercelTokenStore", () => {
  test("is unconfigured when vercel.json does not exist", () => {
    const store = new VercelTokenStore();
    expect(store.isConfigured()).toBe(false);
    expect(store.getAccessToken()).toBeNull();
  });

  test("persists the token with 0600 permissions and reloads it", async () => {
    const store = new VercelTokenStore();
    store.set("  vercel-token-123  ");

    expect(store.isConfigured()).toBe(true);
    expect(store.getAccessToken()).toBe("vercel-token-123");

    const configPath = path.join(
      TEMP_DIRS[0],
      "settings",
      "vercel.json"
    );
    const info = await stat(configPath);
    expect(info.mode & 0o777).toBe(0o600);
    const raw = await readFile(configPath, "utf8");
    expect(JSON.parse(raw)).toEqual({ accessToken: "vercel-token-123" });
  });

  test("replaces the previous token on a new save", () => {
    const store = new VercelTokenStore();
    store.set("old");
    store.set("new");
    expect(store.getAccessToken()).toBe("new");
  });

  test("rejects empty tokens", () => {
    const store = new VercelTokenStore();
    expect(() => store.set("   ")).toThrow();
    expect(store.isConfigured()).toBe(false);
  });

  test("clear removes the file", async () => {
    const store = new VercelTokenStore();
    store.set("token");
    const configPath = path.join(TEMP_DIRS[0], "settings", "vercel.json");
    store.clear();
    expect(store.isConfigured()).toBe(false);
    expect(await readFile(configPath, "utf8").catch(() => "gone")).toBe("gone");
  });
});
