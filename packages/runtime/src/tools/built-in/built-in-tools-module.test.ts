import { describe, expect, test } from "bun:test";

import { ToolRegistry } from "../tool-registry";

import { createBuiltInToolsModule } from "./built-in-tools-module";

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
      contentText:
        "Base directory for this skill: /tmp/skills/fixture\n\nFixture instructions.",
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
});
