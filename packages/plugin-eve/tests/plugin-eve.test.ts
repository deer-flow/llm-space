import path from "node:path";

import type { Thread } from "@llm-space/core";
import type {
  PluginRegistrar,
  PluginSkillProvider,
  PluginSourceImporter,
  PluginToolProvider,
} from "@llm-space/plugin-api";
import { describe, expect, test } from "bun:test";

import plugin from "../src";

const PLUGIN_ROOT = path.resolve(import.meta.dir, "..");
const PROJECT_ROOT = path.join(PLUGIN_ROOT, "fixtures", "minimal");

describe("bundled Eve plugin", () => {
  test("imports, scopes Skills, and executes a tool through plugin contracts", async () => {
    let sourceImporter: PluginSourceImporter<Thread> | undefined;
    let toolProvider: PluginToolProvider | undefined;
    let skillProvider: PluginSkillProvider | undefined;
    const registrar: PluginRegistrar<Thread> = {
      registerSourceImporter(_id, value) {
        sourceImporter = value;
      },
      registerToolProvider(_id, value) {
        toolProvider = value;
      },
      registerSkillProvider(_id, value) {
        skillProvider = value;
      },
      registerDevelopmentSeeder() {
        return undefined;
      },
    };
    await plugin.activate(registrar, {
      pluginId: "llm-space.eve",
      storage: {
        read: () => Promise.resolve(undefined),
        write: () => Promise.resolve(),
        remove: () => Promise.resolve(),
        list: () => Promise.resolve([]),
      },
      logger: {
        debug() {
          return undefined;
        },
      },
    });

    const operation = { signal: new AbortController().signal };
    const imported = await sourceImporter!.importSource(
      { kind: "path", path: PROJECT_ROOT },
      operation
    );
    const context = imported.contexts[0]!;
    const tools = imported.thread.context?.tools ?? [];
    const echo = tools.find((tool) => tool.name === "echo");

    expect(imported.thread.context).not.toHaveProperty("eve");
    expect(echo).toMatchObject({
      type: "plugin",
      pluginId: "llm-space.eve",
      providerId: "eve.tools",
      contextId: context.contextId,
    });
    expect(
      (await skillProvider!.listSkills(context, operation))[0]
    ).toMatchObject({ name: "research-helper" });
    expect(
      await toolProvider!.callTool(
        {
          context,
          toolRef: "tool:agent/tools/echo.ts",
          arguments: { text: "plugin" },
        },
        operation
      )
    ).toEqual({ contentText: "echo:plugin", isError: false });
  });
});
