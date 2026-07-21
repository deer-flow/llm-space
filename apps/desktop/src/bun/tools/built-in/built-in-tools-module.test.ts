import { describe, expect, test } from "bun:test";

import { DesktopHost } from "../../host/desktop-host";

import { createBuiltInToolsModule } from "./built-in-tools-module";

describe("built-in tools module", () => {
  test("contributes the existing tools in their RPC list order", async () => {
    const host = new DesktopHost({
      modules: [
        createBuiltInToolsModule({
          env: {},
          bashPath: "/bin/bash",
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
        }),
      ],
    });

    await host.start();

    expect(host.tools.listTools().map((tool) => tool.name)).toEqual([
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
      await host.tools.call({
        name: "skill",
        arguments: { name: "fixture" },
      })
    ).toEqual({
      contentText:
        "Base directory for this skill: /tmp/skills/fixture\n\nFixture instructions.",
    });
  });

  test("reports a missing dependency with module context", async () => {
    const host = new DesktopHost({
      modules: [
        createBuiltInToolsModule({
          env: {},
          bashPath: "/bin/bash",
          findSkill: undefined,
          getSearchSettings: () => ({
            provider: "firecrawl",
            braveApiKey: "",
            firecrawlApiKey: "",
            tavilyApiKey: "",
          }),
          workspaceRoot: "/tmp/workspace",
        } as never),
      ],
    });

    let rejection: unknown;
    try {
      await host.start();
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toBe(
      'Failed to register desktop module "llm-space.built-in-tools": Missing built-in tools dependency "findSkill".'
    );
  });
});
