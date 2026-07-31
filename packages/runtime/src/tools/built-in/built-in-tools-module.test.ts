import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ToolRegistry } from "../tool-registry";

import { createBuiltInToolsModule } from "./built-in-tools-module";

const TEMP_DIRS: string[] = [];

afterEach(async () => {
  await Promise.all(
    TEMP_DIRS.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("built-in tools module", () => {
  test("contributes the existing tools in their RPC list order", async () => {
    const tools = new ToolRegistry();
    const module = createBuiltInToolsModule({
      env: {},
      findSkill: (name) =>
        name === "fixture"
          ? {
              frontmatters: {},
              content: "Fixture instructions.",
              path: "/tmp/skills/fixture",
            }
          : null,
      getSearchSettings: () => ({
        provider: "firecrawl",
        braveApiKey: "",
        firecrawlApiKey: "",
        tavilyApiKey: "",
      }),
      workspaceRoot: "/tmp/workspace",
    });
    module.register(tools);
    tools.freeze();

    expect(tools.listTools().map((tool) => tool.name)).toEqual([
      "web_fetch",
      "web_search",
      "weather_report",
      "read",
      "write",
      "skill",
      "edit",
      "ls",
      "tree",
      "grep",
      "glob",
      "bash",
      "present_files",
      "todo_write",
      "sleep",
      "ask_user_question",
    ]);
    expect(
      await tools.call({
        name: "skill",
        arguments: { name: "fixture" },
      })
    ).toEqual({
      content: [
        {
          type: "text",
          text: "Base directory for this skill: /tmp/skills/fixture\n\nFixture instructions.",
        },
      ],
    });
  });

  test("reports a missing dependency", () => {
    const tools = new ToolRegistry();
    const module = createBuiltInToolsModule({
      env: {},
      findSkill: undefined,
      getSearchSettings: () => ({
        provider: "firecrawl",
        braveApiKey: "",
        firecrawlApiKey: "",
        tavilyApiKey: "",
      }),
      workspaceRoot: "/tmp/workspace",
    } as never);

    expect(() => module.register(tools)).toThrow(
      'Missing built-in tools dependency "findSkill".'
    );
  });

  test("returns image bytes as structured content when reading an image", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "read-tool-"));
    TEMP_DIRS.push(directory);
    const imagePath = path.join(directory, "pixel.png");
    const base64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X2NDWQAAAABJRU5ErkJggg==";
    await writeFile(imagePath, Buffer.from(base64, "base64"));

    const tools = new ToolRegistry();
    createBuiltInToolsModule({
      env: {},
      findSkill: () => null,
      getSearchSettings: () => ({
        provider: "firecrawl",
        braveApiKey: "",
        firecrawlApiKey: "",
        tavilyApiKey: "",
      }),
      workspaceRoot: directory,
    }).register(tools);
    tools.freeze();

    expect(
      await tools.call({
        name: "read",
        arguments: { path: imagePath },
      })
    ).toEqual({
      content: [
        {
          type: "text",
          text: `[image file: ${imagePath} (70 bytes)]`,
        },
        { type: "image", data: base64, mimeType: "image/png" },
      ],
    });
  });

  test("keeps unsupported model image formats as text placeholders", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "read-tool-"));
    TEMP_DIRS.push(directory);
    const imagePath = path.join(directory, "vector.svg");
    await writeFile(imagePath, "<svg/>");

    const tools = new ToolRegistry();
    createBuiltInToolsModule({
      env: {},
      findSkill: () => null,
      getSearchSettings: () => ({
        provider: "firecrawl",
        braveApiKey: "",
        firecrawlApiKey: "",
        tavilyApiKey: "",
      }),
      workspaceRoot: directory,
    }).register(tools);
    tools.freeze();

    expect(
      await tools.call({
        name: "read",
        arguments: { path: imagePath },
      })
    ).toEqual({
      content: [
        {
          type: "text",
          text: `[image file: ${imagePath} (6 bytes)]`,
        },
      ],
    });
  });

  test("rejects model images larger than the read limit", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "read-tool-"));
    TEMP_DIRS.push(directory);
    const imagePath = path.join(directory, "oversized.png");
    await writeFile(imagePath, "");
    await truncate(imagePath, 20 * 1024 * 1024 + 1);

    const tools = new ToolRegistry();
    createBuiltInToolsModule({
      env: {},
      findSkill: () => null,
      getSearchSettings: () => ({
        provider: "firecrawl",
        braveApiKey: "",
        firecrawlApiKey: "",
        tavilyApiKey: "",
      }),
      workspaceRoot: directory,
    }).register(tools);
    tools.freeze();

    expect(
      tools.call({
        name: "read",
        arguments: { path: imagePath },
      })
    ).rejects.toThrow("maximum 20971520 bytes / 20 MiB");
  });
});
