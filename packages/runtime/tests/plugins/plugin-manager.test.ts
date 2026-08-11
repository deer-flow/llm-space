import { afterEach, describe, expect, test } from "bun:test";
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

import type { McpServerConfig } from "@llm-space/core";

import type { ProviderConfig } from "../../src/models/types";
import { PluginManager } from "../../src/plugins/plugin-manager";
import type { PluginSkillConflict } from "../../src/skills/skills-manager";


const roots: string[] = [];
const managers: PluginManager[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.shutdown()));
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("PluginManager", () => {
  test("uninstalls a plugin and removes its directory", async () => {
    const home = _home();
    const root = _plugin(home, "removable-plugin");
    const { manager } = await _manager(home);

    expect(manager.listPlugins().map((plugin) => plugin.id)).toContain(
      "removable-plugin"
    );

    expect(await manager.uninstallPlugin("removable-plugin")).toEqual([]);
    expect(existsSync(root)).toBe(false);
  });

  test("activates valid extensions and isolates a broken command", async () => {
    const home = _home();
    const root = _plugin(home, "mixed-plugin");
    mkdirSync(path.join(root, "commands"));
    writeFileSync(
      path.join(root, "commands", "hello.ts"),
      `export default class Hello { displayName = "Hello"; description = "Say hello"; execute() { return "hello"; } }`
    );
    writeFileSync(
      path.join(root, "commands", "broken.ts"),
      `throw new Error("broken import")`
    );
    mkdirSync(path.join(root, "tools"));
    writeFileSync(
      path.join(root, "tools", "project-info.ts"),
      `export default class ProjectInfo {
        name = "project_info";
        description = "Read project information";
        parameters = { type: "object", properties: {} };
        execute(context, args) { return { cwd: context.variables.cwd, title: context.thread.title, args }; }
      }`
    );
    mkdirSync(path.join(root, "thread-storages"));
    writeFileSync(
      path.join(root, "thread-storages", "memory.ts"),
      `export default class Memory { displayName = "Memory"; description = "Keep threads in memory"; capabilities = { read: false, write: false }; }`
    );

    const { manager } = await _manager(home);
    const plugin = manager.listPlugins()[0];
    expect(plugin).toMatchObject({
      id: "mixed-plugin",
      enabled: true,
      status: "degraded",
    });
    expect(manager.commands.list().map((command) => command.id)).toEqual([
      "plugin:mixed-plugin:command:hello",
    ]);
    expect(
      await manager.commands.execute("plugin:mixed-plugin:command:hello")
    ).toBe("hello");
    const pluginTool = manager.tools.list()[0];
    expect(pluginTool).toMatchObject({
      type: "plugin",
      pluginId: "mixed-plugin",
      toolId: "plugin:mixed-plugin:tool:project-info",
      name: "project_info",
    });
    if (!pluginTool) throw new Error("Expected Plugin Tool");
    expect(
      await manager.tools.execute(
        pluginTool,
        {
          thread: { title: "Owning thread", context: {} },
          variables: { cwd: "/workspace" },
        },
        { detail: true }
      )
    ).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              cwd: "/workspace",
              title: "Owning thread",
              args: { detail: true },
            },
            null,
            2
          ),
        },
      ],
    });
    expect(
      plugin?.extensions.find(
        (extension) => extension.id === "plugin:mixed-plugin:command:hello"
      )
    ).toMatchObject({
      description: "Say hello",
      sourcePath: path.join(root, "commands", "hello.ts"),
    });
    expect(
      plugin?.extensions.find(
        (extension) => extension.id === "plugin:mixed-plugin:tool:project-info"
      )?.description
    ).toBe("Read project information");
    expect(
      plugin?.extensions.find(
        (extension) => extension.id === "plugin:mixed-plugin:command:broken"
      )?.sourcePath
    ).toBe(path.join(root, "commands", "broken.ts"));
    expect(
      plugin?.extensions.find(
        (extension) =>
          extension.id === "plugin:mixed-plugin:thread-storage:memory"
      )
    ).toMatchObject({
      description: "Keep threads in memory",
      sourcePath: path.join(root, "thread-storages", "memory.ts"),
    });
    const logPath = plugin?.extensions.find((extension) => extension.error)
      ?.error?.logPath;
    expect(logPath).toBeString();
    if (!logPath) throw new Error("Expected plugin diagnostic log");
    expect(readFileSync(logPath, "utf8").length).toBeGreaterThan(0);

    await manager.setEnabled("mixed-plugin", false);
    expect(manager.tools.list()).toEqual([]);
    expect(
      manager.tools.execute(
        pluginTool,
        { thread: { context: {} }, variables: {} },
        {}
      )
    ).rejects.toThrow(
      "Plugin tool is unavailable: mixed-plugin/plugin:mixed-plugin:tool:project-info"
    );
  });

  test("rebuilds read-only contributions and removes them on disable", async () => {
    const home = _home();
    const root = _plugin(home, "declarative");
    mkdirSync(path.join(root, "skills", "review"), { recursive: true });
    writeFileSync(
      path.join(root, "skills", "review", "SKILL.md"),
      "---\nname: review\ndescription: Review code\n---\n"
    );
    writeFileSync(
      path.join(root, "mcp.json"),
      JSON.stringify({
        servers: [
          { id: "local", name: "Local", transport: "stdio", command: "tool" },
        ],
      })
    );
    writeFileSync(
      path.join(root, "models.json"),
      JSON.stringify({
        providers: [
          {
            id: "local",
            name: "Local",
            api: "openai-completions",
            baseUrl: "${settings.endpoint}",
            models: [],
          },
        ],
      })
    );
    writeFileSync(
      path.join(root, "config.schema.json"),
      JSON.stringify({
        type: "object",
        properties: {
          endpoint: { type: "string", default: "http://localhost" },
        },
      })
    );

    const state = await _manager(home);
    expect(state.skillPaths).toHaveLength(1);
    expect(state.mcpServers[0]?.server.id).toBe("plugin:declarative:mcp:local");
    expect(state.modelProviders[0]?.provider.baseUrl).toBe("http://localhost");
    expect(
      Object.fromEntries(
        state.manager
          .listPlugins()[0]
          .extensions.map((extension) => [extension.kind, extension.sourcePath])
      )
    ).toEqual({
      settings: path.join(root, "config.schema.json"),
      skill: path.join(root, "skills", "review"),
      mcp: path.join(root, "mcp.json"),
      model: path.join(root, "models.json"),
    });
    expect(
      state.manager
        .listPlugins()[0]
        .extensions.find((extension) => extension.kind === "skill")?.description
    ).toBe("Review code");

    await state.manager.setEnabled("declarative", false);
    expect(state.skillPaths).toEqual([]);
    expect(state.mcpServers).toEqual([]);
    expect(state.modelProviders).toEqual([]);
    expect(managerCommandIds(state.manager)).toEqual([]);
  });

  test("identifies both files in a skill conflict diagnostic", async () => {
    const home = _home();
    const root = _plugin(home, "conflicting-skills");
    const pluginSkill = path.join(root, "skills", "review");
    const userSkill = path.join(home, "user-skills", "review");
    mkdirSync(pluginSkill, { recursive: true });
    writeFileSync(
      path.join(pluginSkill, "SKILL.md"),
      "---\nname: review\ndescription: Review code\n---\n"
    );

    const { manager } = await _manager(home, [
      {
        pluginId: "conflicting-skills",
        path: pluginSkill,
        name: "review",
        conflictingPaths: [userSkill],
      },
    ]);
    const error = manager
      .listPlugins()[0]
      ?.extensions.find((extension) => extension.kind === "skill")?.error;

    expect(error?.summary).toContain(path.join(pluginSkill, "SKILL.md"));
    expect(error?.summary).toContain(path.join(userSkill, "SKILL.md"));
  });

  test("refreshes discovery and reloads a plugin after its files change", async () => {
    const home = _home();
    const state = await _manager(home);
    expect(state.manager.listPlugins()).toEqual([]);

    const root = _plugin(home, "dynamic");
    await state.manager.refreshPlugins();
    expect(state.manager.listPlugins().map((plugin) => plugin.id)).toEqual([
      "dynamic",
    ]);

    mkdirSync(path.join(root, "commands"));
    writeFileSync(
      path.join(root, "commands", "hello.ts"),
      `export default class Hello { displayName = "Hello"; execute() { return "hello"; } }`
    );
    await state.manager.reloadPlugin("dynamic");
    expect(managerCommandIds(state.manager)).toEqual([
      "plugin:dynamic:command:hello",
    ]);

    rmSync(root, { recursive: true });
    await state.manager.refreshPlugins();
    expect(state.manager.listPlugins()).toEqual([]);
    expect(managerCommandIds(state.manager)).toEqual([]);
  });
});

function _home(): string {
  const home = mkdtempSync(path.join(os.tmpdir(), "llm-space-plugin-manager-"));
  roots.push(home);
  mkdirSync(path.join(home, "plugins"), { recursive: true });
  return home;
}

function _plugin(home: string, name: string): string {
  const root = path.join(home, "plugins", name);
  mkdirSync(root, { recursive: true });
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name,
      version: "1.0.0",
      engines: { "llm-space": ">=4 <5" },
    })
  );
  return root;
}

async function _manager(
  home: string,
  skillConflicts: PluginSkillConflict[] = []
) {
  let skillPaths: { pluginId: string; path: string }[] = [];
  let mcpServers: { pluginId: string; server: McpServerConfig }[] = [];
  let modelProviders: { pluginId: string; provider: ProviderConfig }[] = [];
  const manager = await PluginManager.create({
    homePath: home,
    appVersion: "4.7.1",
    runnerPath: path.join(import.meta.dir, "../../src/plugins/plugin-runner.ts"),
    skillsManager: {
      readSkill: (skillPath) => {
        const raw = readFileSync(path.join(skillPath, "SKILL.md"), "utf8");
        const description = /^description:\s*(.+)$/m.exec(raw)?.[1] ?? "";
        return {
          frontmatters: { description },
          content: raw,
          path: skillPath,
        };
      },
      setPluginPaths: (entries) => {
        skillPaths = entries;
        return skillConflicts;
      },
    },
    mcpManager: {
      setPluginServers: (entries) => {
        mcpServers = entries;
        return Promise.resolve();
      },
    },
    modelManager: {
      setPluginProviders: (entries) => {
        modelProviders = entries;
      },
    },
  });
  managers.push(manager);
  return {
    manager,
    get skillPaths() {
      return skillPaths;
    },
    get mcpServers() {
      return mcpServers;
    },
    get modelProviders() {
      return modelProviders;
    },
  };
}

function managerCommandIds(manager: PluginManager): string[] {
  return manager.commands.list().map((command) => command.id);
}
