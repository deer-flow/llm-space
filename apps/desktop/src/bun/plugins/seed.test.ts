import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { PluginToolExtension } from "@llm-space/core";

import {
  MEMORY_PLUGIN_FILES,
  MEMORY_PLUGIN_ID,
} from "./memory-plugin-files";
import { seedDefaultPlugins } from "./seed";

type PluginToolContextLike = Parameters<PluginToolExtension["execute"]>[0];

/** The runner-facing surface of a seeded plugin tool module. */
interface PluginToolLike {
  name: string;
  execute(context: PluginToolContextLike, args: Record<string, unknown>): unknown;
}

interface StoredRecord {
  id: string;
  content: string;
  tags?: string[];
  origin?: string | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

interface SearchResult {
  returned: number;
  total: number;
  memories: StoredRecord[];
}

interface SaveResult {
  saved: boolean;
  id?: string;
  updated?: boolean;
  duplicate?: boolean;
  existingId?: string;
  evicted?: number;
  archived?: boolean;
}

interface Harness {
  save: PluginToolLike;
  search: PluginToolLike;
  forget: PluginToolLike;
  notifications: string[];
  context(cwd?: string): PluginToolContextLike;
  writeStore(records: StoredRecord[]): void;
  readStore(): StoredRecord[];
  archivePath(): string;
}

function _makeTempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "llm-space-memory-seed-"));
}

function _storeFile(): string {
  const home = process.env.LLM_SPACE_HOME!;
  return path.join(
    home,
    "data",
    "plugins",
    "@llm-space",
    "memory",
    "memories.jsonl"
  );
}

async function _withHarness(
  run: (harness: Harness) => void | Promise<void>
): Promise<void> {
  const pluginsDir = _makeTempDir();
  const homeDir = _makeTempDir();
  const previousHome = process.env.LLM_SPACE_HOME;
  process.env.LLM_SPACE_HOME = homeDir;
  const notifications: string[] = [];
  try {
    seedDefaultPlugins(pluginsDir);
    const toolsDir = path.join(
      pluginsDir,
      ...MEMORY_PLUGIN_ID.split("/"),
      "tools"
    );
    // Import the seeded source files exactly like the plugin runner does:
    // Bun compiles TypeScript at import time.
    const stamp = Date.now() + "-" + Math.random().toString(36).slice(2);
    const loadTool = async (fileName: string): Promise<PluginToolLike> => {
      const module = (await import(
        pathToFileURL(path.join(toolsDir, fileName)).href + "?t=" + stamp
      )) as unknown as { default: new () => PluginToolLike };
      return new module.default();
    };
    const save = await loadTool("memory-save.ts");
    const search = await loadTool("memory-search.ts");
    const forget = await loadTool("memory-forget.ts");
    const harness: Harness = {
      save,
      search,
      forget,
      notifications,
      context(cwd = "/tmp/project-a") {
        return {
          variables: { current_working_directory: cwd },
          settings: {},
          notify: (message: string) => {
            notifications.push(message);
            return Promise.resolve();
          },
        } as unknown as PluginToolContextLike;
      },
      writeStore(records: StoredRecord[]) {
        const file = _storeFile();
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(
          file,
          records.map((record) => JSON.stringify(record)).join("\n") + "\n",
          "utf8"
        );
      },
      readStore() {
        const file = _storeFile();
        if (!existsSync(file)) {
          return [];
        }
        return readFileSync(file, "utf8")
          .split("\n")
          .filter((line) => line.trim().length > 0)
          .map((line) => JSON.parse(line) as StoredRecord);
      },
      archivePath() {
        return _storeFile().replace(
          /memories\.jsonl$/,
          "memories.archive.jsonl"
        );
      },
    };
    await run(harness);
  } finally {
    if (previousHome === undefined) {
      delete process.env.LLM_SPACE_HOME;
    } else {
      process.env.LLM_SPACE_HOME = previousHome;
    }
    rmSync(pluginsDir, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  }
}

describe("seedDefaultPlugins", () => {
  test("writes every memory plugin file under the scoped plugin id", () => {
    const pluginsDir = _makeTempDir();
    try {
      seedDefaultPlugins(pluginsDir);
      const pluginRoot = path.join(pluginsDir, ...MEMORY_PLUGIN_ID.split("/"));
      for (const file of MEMORY_PLUGIN_FILES) {
        expect(existsSync(path.join(pluginRoot, ...file.path.split("/")))).toBe(
          true
        );
      }
      const manifest = JSON.parse(
        readFileSync(path.join(pluginRoot, "package.json"), "utf8")
      ) as { name?: string };
      expect(manifest.name).toBe(MEMORY_PLUGIN_ID);
      expect(existsSync(path.join(pluginRoot, "skills/memory/SKILL.md"))).toBe(
        true
      );
    } finally {
      rmSync(pluginsDir, { recursive: true, force: true });
    }
  });

  test("never overwrites an existing installation", () => {
    const pluginsDir = _makeTempDir();
    try {
      seedDefaultPlugins(pluginsDir);
      const pluginRoot = path.join(pluginsDir, ...MEMORY_PLUGIN_ID.split("/"));
      const manifestPath = path.join(pluginRoot, "package.json");
      writeFileSync(manifestPath, "{}", "utf8");
      seedDefaultPlugins(pluginsDir);
      expect(readFileSync(manifestPath, "utf8")).toBe("{}");
    } finally {
      rmSync(pluginsDir, { recursive: true, force: true });
    }
  });

  test("restores a missing bundled file when the install is untouched", () => {
    const pluginsDir = _makeTempDir();
    try {
      seedDefaultPlugins(pluginsDir);
      const pluginRoot = path.join(pluginsDir, ...MEMORY_PLUGIN_ID.split("/"));
      const target = path.join(pluginRoot, "config.schema.json");
      rmSync(target);
      seedDefaultPlugins(pluginsDir);
      expect(existsSync(target)).toBe(true);
    } finally {
      rmSync(pluginsDir, { recursive: true, force: true });
    }
  });
});

describe("memory plugin tools", () => {
  test("save, search, and forget round-trip against a temporary store", async () => {
    const pluginsDir = _makeTempDir();
    const homeDir = _makeTempDir();
    const previousHome = process.env.LLM_SPACE_HOME;
    process.env.LLM_SPACE_HOME = homeDir;
    try {
      seedDefaultPlugins(pluginsDir);
      const toolsDir = path.join(
        pluginsDir,
        ...MEMORY_PLUGIN_ID.split("/"),
        "tools"
      );
      const stamp = Date.now();
      const loadTool = async (
        fileName: string
      ): Promise<PluginToolLike> => {
        const module = (await import(
          pathToFileURL(path.join(toolsDir, fileName)).href + "?t=" + stamp
        )) as unknown as { default: new () => PluginToolLike };
        return new module.default();
      };
      const save = await loadTool("memory-save.ts");
      const search = await loadTool("memory-search.ts");
      const forget = await loadTool("memory-forget.ts");

      expect(save.name).toBe("memory_save");
      expect(search.name).toBe("memory_search");
      expect(forget.name).toBe("memory_forget");

      const context = {
        variables: { current_working_directory: "/tmp/project-a" },
      } as unknown as PluginToolContextLike;

      const saved = save.execute(context, {
        content: "Vincent uses bun, never npm, for this monorepo.",
        tags: ["preference", "toolchain"],
      }) as { saved: boolean; id: string };
      expect(saved.saved).toBe(true);

      save.execute(context, {
        content: "项目使用 Vitest 风格的测试，通过 mise 运行任务。",
        tags: ["convention"],
      });

      // Cross-project: a different working directory finds the same memory.
      const otherProject = {
        variables: { current_working_directory: "/tmp/project-b" },
      } as unknown as PluginToolContextLike;
      const found = search.execute(otherProject, {
        query: "bun toolchain preference",
      }) as {
        returned: number;
        memories: { id: string; content: string; origin: string | null }[];
      };
      expect(found.returned).toBeGreaterThan(0);
      expect(found.memories[0].content).toContain("bun");
      expect(found.memories[0].origin).toBe("/tmp/project-a");

      const removed = forget.execute(otherProject, {
        id: saved.id,
      }) as { deleted: boolean };
      expect(removed.deleted).toBe(true);

      const empty = search.execute(otherProject, {
        query: "bun toolchain preference",
      }) as { returned: number };
      expect(empty.returned).toBe(0);
    } finally {
      if (previousHome === undefined) {
        delete process.env.LLM_SPACE_HOME;
      } else {
        process.env.LLM_SPACE_HOME = previousHome;
      }
      rmSync(pluginsDir, { recursive: true, force: true });
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});

describe("memory retrieval across scripts", () => {
  test("recalls Japanese, Korean, Arabic, Cyrillic and Chinese memories", async () => {
    await _withHarness((h) => {
      const entries: [string, string, string][] = [
        ["これを覚えて：テストは mise で実行する", "テスト 実行", "テスト"],
        ["プロジェクトでは bun を使う", "bun を使う", "bun"],
        ["البحث في الذاكرة يحتاج محرك بحث", "الذاكرة", "الذاكرة"],
        ["память поиск использует bun", "память", "память"],
        ["專案使用 bun 管理依賴", "依賴", "依賴"],
      ];
      for (const [content] of entries) {
        h.save.execute(h.context(), { content });
      }
      for (const [, query, marker] of entries) {
        const result = h.search.execute(h.context(), { query }) as SearchResult;
        expect(result.returned).toBeGreaterThan(0);
        expect(result.memories[0].content).toContain(marker);
      }
    });
  });

  test("script-agnostic tokenizer also covers scripts without UI translations", async () => {
    await _withHarness((h) => {
      h.save.execute(h.context(), { content: "ค้นหาความจำ ใช้ bun เสมอ" });
      h.save.execute(h.context(), { content: "חיפוש זיכרון משתמש ב-bun" });
      expect(
        (h.search.execute(h.context(), { query: "ความจำ" }) as SearchResult)
          .returned
      ).toBeGreaterThan(0);
      expect(
        (h.search.execute(h.context(), { query: "זיכרון" }) as SearchResult)
          .returned
      ).toBeGreaterThan(0);
    });
  });

  test("matches continuous scripts by sub-terms, not only exact substrings", async () => {
    await _withHarness((h) => {
      h.save.execute(h.context(), {
        content: "東京都の設定は bun で管理する",
      });
      const result = h.search.execute(h.context(), {
        query: "東京",
      }) as SearchResult;
      expect(result.returned).toBe(1);
      expect(result.memories[0].content).toContain("東京都");
    });
  });

  test("normalizes Arabic diacritics and alef variants", async () => {
    await _withHarness((h) => {
      h.save.execute(h.context(), { content: "البحث في الذاكرة يحتاج محرك" });
      const withMarks = h.search.execute(h.context(), {
        query: "البَحْثُ",
      }) as SearchResult;
      expect(withMarks.returned).toBe(1);
      const withVariant = h.search.execute(h.context(), {
        query: "ألبحث",
      }) as SearchResult;
      expect(withVariant.returned).toBe(1);
    });
  });

  test("prefers whole-word matches over accidental substrings", async () => {
    await _withHarness((h) => {
      h.save.execute(h.context(), { content: "we started the chart project" });
      h.save.execute(h.context(), { content: "art project lives here" });
      const result = h.search.execute(h.context(), {
        query: "art",
      }) as SearchResult;
      expect(result.memories[0].content).toBe("art project lives here");
    });
  });
});

describe("memory storage governance", () => {
  test("archives the oldest memories instead of dropping them", async () => {
    await _withHarness((h) => {
      const seeded: StoredRecord[] = [];
      for (let i = 0; i < 1000; i++) {
        seeded.push({
          id: "m_seed_" + i,
          content: "seed memory number " + i,
          tags: [],
          origin: null,
          createdAt: new Date().toISOString(),
        });
      }
      h.writeStore(seeded);
      const oldest = seeded[0].content;
      const result = h.save.execute(h.context(), {
        content: "brand new memory",
      }) as SaveResult;
      expect(result.saved).toBe(true);
      expect(result.evicted).toBe(1);
      expect(result.archived).toBe(true);

      const store = h.readStore();
      expect(store.length).toBe(1000);
      expect(store.some((record) => record.content === oldest)).toBe(false);
      expect(readFileSync(h.archivePath(), "utf8")).toContain(oldest);
      expect(
        h.notifications.some((message) =>
          message.includes("memories.archive.jsonl")
        )
      ).toBe(true);
    });
  });

  test("saving identical content returns the existing id", async () => {
    await _withHarness((h) => {
      const first = h.save.execute(h.context(), {
        content: "Vincent uses bun, never npm.",
      }) as SaveResult;
      const second = h.save.execute(h.context(), {
        content: "Vincent uses bun, never npm.",
      }) as SaveResult;
      expect(second.duplicate).toBe(true);
      expect(second.id).toBe(first.id);
      expect(h.readStore().length).toBe(1);
    });
  });

  test("reports near-duplicates instead of stacking copies", async () => {
    await _withHarness((h) => {
      const first = h.save.execute(h.context(), {
        content: "The team runs tasks with mise, never with make.",
      }) as SaveResult;
      const second = h.save.execute(h.context(), {
        content: "The team runs tasks with mise, never with make!",
      }) as SaveResult;
      expect(second.saved).toBe(false);
      expect(second.duplicate).toBe(true);
      expect(second.existingId).toBe(first.id);
      expect(h.readStore().length).toBe(1);
    });
  });

  test("updates a memory in place when an id is given", async () => {
    await _withHarness((h) => {
      const first = h.save.execute(h.context(), {
        content: "Prefers tabs over spaces.",
      }) as SaveResult;
      const updated = h.save.execute(h.context(), {
        id: first.id,
        content: "Prefers spaces over tabs.",
        tags: ["style"],
      }) as SaveResult;
      expect(updated.updated).toBe(true);
      expect(updated.id).toBe(first.id);
      const store = h.readStore();
      expect(store.length).toBe(1);
      expect(store[0].content).toBe("Prefers spaces over tabs.");
      expect(typeof store[0].updatedAt).toBe("string");
    });
  });

  test("boosts the current project and honours the project scope", async () => {
    await _withHarness((h) => {
      h.save.execute(h.context("/tmp/project-a"), {
        content: "Uses vitest for tests.",
      });
      h.save.execute(h.context("/tmp/project-b"), {
        content: "Uses vitest for tests too.",
      });
      const scoped = h.search.execute(h.context(), {
        query: "vitest tests",
        scope: "project",
      }) as SearchResult;
      expect(scoped.returned).toBe(1);
      expect(scoped.memories[0].origin).toBe("/tmp/project-a");

      const auto = h.search.execute(h.context(), {
        query: "vitest tests",
      }) as SearchResult;
      expect(auto.returned).toBe(2);
      expect(auto.memories[0].origin).toBe("/tmp/project-a");
    });
  });

  test("fades old memories but never below the decay floor", async () => {
    await _withHarness((h) => {
      const longAgo = new Date(Date.now() - 1000 * 86400000).toISOString();
      h.writeStore([
        {
          // Only matches through its tag: a higher base score than m_new, so
          // it wins without decay (5 + 2) and loses with it (floor 30%).
          id: "m_old",
          content: "the package manager is decided by team convention",
          tags: ["bun"],
          origin: null,
          createdAt: longAgo,
        },
        {
          id: "m_new",
          content: "bun is the package manager here",
          tags: [],
          origin: null,
          createdAt: new Date().toISOString(),
        },
      ]);
      const result = h.search.execute(h.context(), {
        query: "bun",
      }) as SearchResult;
      expect(result.returned).toBe(2);
      expect(result.memories[0].id).toBe("m_new");
    });
  });
});
