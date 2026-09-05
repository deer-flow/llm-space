import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { atomicWriteJsonFileSync, getSettingsDir } from "@llm-space/core/server";

import { SearchSettingsManager } from "../../src/search/search-settings-manager";

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), "llm-space-search-test-"));
  process.env.LLM_SPACE_HOME = tmpRoot;
  await mkdir(getSettingsDir(), { recursive: true });
});

afterAll(async () => {
  delete process.env.LLM_SPACE_HOME;
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("SearchSettingsManager", () => {
  test("normalizes a legacy search.json missing searxngBaseUrl to the default", () => {
    atomicWriteJsonFileSync(path.join(getSettingsDir(), "search.json"), {
      provider: "tavily",
      braveApiKey: "b",
      firecrawlApiKey: "f",
      tavilyApiKey: "t",
    });
    const settings = new SearchSettingsManager().get();
    expect(settings.provider).toBe("tavily");
    expect(settings.searxngBaseUrl).toBe("http://localhost:8080");
  });

  test("set() persists the searxng provider and a custom base URL", () => {
    const manager = new SearchSettingsManager();
    const saved = manager.set({
      provider: "searxng",
      braveApiKey: "b",
      firecrawlApiKey: "f",
      tavilyApiKey: "t",
      searxngBaseUrl: "http://searxng.lan:8888",
    });
    expect(saved.provider).toBe("searxng");
    expect(saved.searxngBaseUrl).toBe("http://searxng.lan:8888");
    expect(new SearchSettingsManager().get().provider).toBe("searxng");
  });
});
