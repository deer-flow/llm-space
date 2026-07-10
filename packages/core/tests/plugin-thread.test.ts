import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "bun:test";
import { Compile } from "typebox/compile";

import { isExecutableTool, Thread, type Thread as ThreadType } from "../src";
import { LocalFileSystem } from "../src/server";

const validator = Compile(Thread);

describe("plugin-backed Thread persistence", () => {
  test("validates and reloads generic plugin contexts and tools", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "llm-space-core-plugin-"));
    const thread: ThreadType = {
      title: "Plugin thread",
      context: {
        plugins: [
          {
            contextId: "fixture-context",
            pluginId: "fixture.plugin",
            sourceId: "fixture.source",
            schemaVersion: 1,
            label: "Fixture",
            data: { root: "/fixture", flags: [true, null] },
            toolProviderId: "fixture.tools",
            skillProviderId: "fixture.skills",
          },
        ],
        tools: [
          {
            type: "plugin",
            name: "echo",
            description: "Echo text.",
            parameters: { type: "object" },
            pluginId: "fixture.plugin",
            providerId: "fixture.tools",
            toolRef: "echo",
            contextId: "fixture-context",
          },
        ],
      },
    };
    try {
      expect(validator.Check(thread)).toBe(true);
      expect(isExecutableTool(thread.context!.tools![0]!)).toBe(true);
      const storage = new LocalFileSystem(root);
      await storage.write("plugin.json", thread);
      expect(await storage.read("plugin.json")).toEqual(thread);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects non-JSON plugin context data", () => {
    const invalid = {
      context: {
        plugins: [
          {
            contextId: "invalid",
            pluginId: "fixture.plugin",
            sourceId: "fixture.source",
            schemaVersion: 1,
            label: "Invalid",
            data: { value: undefined },
          },
        ],
      },
    };

    expect(validator.Check(invalid)).toBe(false);
  });
});
