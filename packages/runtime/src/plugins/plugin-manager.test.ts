import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import type { McpServerConfig } from "@llm-space/core";

import type { ProviderConfig } from "../models/types";

import { PluginManager } from "./plugin-manager";

const roots: string[] = [];
const managers: PluginManager[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.shutdown()));
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("PluginManager", () => {
  test("activates valid extensions and isolates a broken command", async () => {
    const home = _home();
    const root = _plugin(home, "mixed-plugin");
    mkdirSync(path.join(root, "commands"));
    writeFileSync(
      path.join(root, "commands", "hello.ts"),
      `export default class Hello { displayName = "Hello"; execute() { return "hello"; } }`
    );
    writeFileSync(
      path.join(root, "commands", "broken.ts"),
      `throw new Error("broken import")`
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
    const logPath = plugin?.extensions.find((extension) => extension.error)
      ?.error?.logPath;
    expect(logPath).toBeString();
    if (!logPath) throw new Error("Expected plugin diagnostic log");
    expect(readFileSync(logPath, "utf8").length).toBeGreaterThan(0);
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

    await state.manager.setEnabled("declarative", false);
    expect(state.skillPaths).toEqual([]);
    expect(state.mcpServers).toEqual([]);
    expect(state.modelProviders).toEqual([]);
    expect(managerCommandIds(state.manager)).toEqual([]);
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

async function _manager(home: string) {
  let skillPaths: { pluginId: string; path: string }[] = [];
  let mcpServers: { pluginId: string; server: McpServerConfig }[] = [];
  let modelProviders: { pluginId: string; provider: ProviderConfig }[] = [];
  const manager = await PluginManager.create({
    homePath: home,
    appVersion: "4.7.1",
    runnerPath: path.join(import.meta.dir, "plugin-runner.ts"),
    skillsManager: {
      setPluginPaths: (entries) => {
        skillPaths = entries;
        return [];
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
