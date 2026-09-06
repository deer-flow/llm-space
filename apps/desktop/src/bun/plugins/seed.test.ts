import { describe, expect, test } from "bun:test";
import {
  existsSync,
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

function _makeTempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "llm-space-memory-seed-"));
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
      // Import the seeded source files exactly like the plugin runner does:
      // Bun compiles TypeScript at import time.
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
