import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Thread } from "@llm-space/core";
import {
  definePlugin,
  type PluginContext,
  type PluginManifest,
} from "@llm-space/plugin-api";
import { afterEach, describe, expect, test } from "bun:test";

import { PluginManager } from "./plugin-manager";
import type { BundledPlugin } from "./types";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("PluginManager", () => {
  test("runs the public plugin flow with one lazy, idempotent activation", async () => {
    let activations = 0;
    const context = _fixtureContext();
    const plugin = definePlugin<Thread>({
      async activate(registrar, activation) {
        activations += 1;
        await activation.storage.write("activation", activations);
        registrar.registerSourceImporter("fixture.source", {
          importSource() {
            return Promise.resolve({
              thread: _fixtureThread(context),
              contexts: [context],
              diagnostics: [
                {
                  pluginId: "fixture.plugin",
                  contributionId: "fixture.source",
                  severity: "info",
                  code: "fixture_imported",
                  message: "Fixture source imported.",
                },
              ],
            });
          },
        });
        registrar.registerToolProvider("fixture.tools", {
          listTools() {
            return Promise.resolve([
              {
                name: "echo",
                description: "Echo text.",
                parameters: { type: "object" },
                toolRef: "echo",
                contextId: context.contextId,
              },
            ]);
          },
          callTool(input) {
            const text = input.arguments.text;
            return Promise.resolve({
              contentText: typeof text === "string" ? text : "",
              isError: false,
            });
          },
        });
        registrar.registerSkillProvider("fixture.skills", {
          listSkills() {
            return Promise.resolve([
              {
                name: "fixture-skill",
                description: "Fixture instructions.",
                resourceRef: "fixture-skill",
              },
            ]);
          },
          readSkill() {
            return Promise.resolve({
              name: "fixture-skill",
              content: "Use the fixture.",
            });
          },
        });
      },
    });
    const manager = _manager([
      {
        manifest: _fixtureManifest(),
        load: () => Promise.resolve({ default: plugin }),
      },
    ]);
    manager.initialize();

    expect(manager.listPlugins()[0]).toMatchObject({
      id: "fixture.plugin",
      state: "inactive",
      enabled: true,
    });

    const [imported, skills] = await Promise.all([
      manager.importSource({
        pluginId: "fixture.plugin",
        importerId: "fixture.source",
        source: { kind: "path", path: "/fixture" },
      }),
      manager.listSkills({
        pluginId: "fixture.plugin",
        providerId: "fixture.skills",
        context,
      }),
    ]);

    expect(activations).toBe(1);
    expect(imported.thread.title).toBe("Fixture");
    expect(skills[0]?.name).toBe("fixture-skill");
    expect(
      await manager.callTool({
        pluginId: "fixture.plugin",
        providerId: "fixture.tools",
        context,
        toolRef: "echo",
        arguments: { text: "ok" },
      })
    ).toEqual({ contentText: "ok", isError: false });
    expect(manager.listPlugins()[0]?.diagnostics.slice(-1)[0]?.code).toBe(
      "fixture_imported"
    );

    await manager.setEnabled("fixture.plugin", false);
    expect(manager.listPlugins()[0]?.state).toBe("disabled");
    await _expectError(
      manager.listSkills({
        pluginId: "fixture.plugin",
        providerId: "fixture.skills",
        context,
      }),
      "disabled"
    );
  });

  test("isolates activation failure and rejects undeclared registrations", async () => {
    const broken = definePlugin<Thread>({
      activate(registrar) {
        registrar.registerToolProvider("not.declared", {
          listTools: () => Promise.resolve([]),
          callTool: () => Promise.resolve({ contentText: "", isError: false }),
        });
      },
    });
    const manager = _manager([
      {
        manifest: _fixtureManifest(),
        load: () => Promise.resolve({ default: broken }),
      },
    ]);
    manager.initialize();

    await _expectError(
      manager.importSource({
        pluginId: "fixture.plugin",
        importerId: "fixture.source",
        source: { kind: "path", path: "/fixture" },
      }),
      "undeclared"
    );
    expect(manager.listPlugins()[0]).toMatchObject({ state: "failed" });
    expect(manager.listPlugins()[0]?.diagnostics.slice(-1)[0]?.code).toBe(
      "activation_failed"
    );
  });

  test("rejects duplicate plugin IDs before either runtime can activate", () => {
    let loaded = 0;
    const descriptor = {
      manifest: _fixtureManifest(),
      load: () => {
        loaded += 1;
        return Promise.resolve({
          default: definePlugin({
            activate() {
              return undefined;
            },
          }),
        });
      },
    };
    const manager = _manager([descriptor, descriptor]);
    manager.initialize();

    expect(manager.listPlugins()[0]).toMatchObject({
      id: "fixture.plugin",
      state: "invalid",
    });
    expect(loaded).toBe(0);
  });

  test("rejects incompatible engines before runtime import", () => {
    let loaded = 0;
    const manifest = _fixtureManifest();
    manifest.apiVersion = "2.0.0";
    const manager = _manager([
      {
        manifest,
        load: () => {
          loaded += 1;
          return Promise.resolve({
            default: definePlugin({
              activate() {
                return undefined;
              },
            }),
          });
        },
      },
    ]);
    manager.initialize();

    expect(manager.listPlugins()[0]).toMatchObject({
      compatible: false,
      state: "invalid",
    });
    expect(loaded).toBe(0);
  });

  test("propagates AbortSignal cancellation into a long-running call", async () => {
    const context = _fixtureContext();
    const plugin = definePlugin<Thread>({
      activate(registrar) {
        registrar.registerSourceImporter("fixture.source", {
          importSource: () =>
            Promise.resolve({
              thread: _fixtureThread(context),
              contexts: [context],
              diagnostics: [],
            }),
        });
        registrar.registerToolProvider("fixture.tools", {
          listTools: () => Promise.resolve([]),
          callTool: (_input, operation) =>
            new Promise((_resolve, reject) => {
              operation.signal.addEventListener(
                "abort",
                () => reject(new Error("provider cancelled")),
                { once: true }
              );
            }),
        });
        registrar.registerSkillProvider("fixture.skills", {
          listSkills: () => Promise.resolve([]),
          readSkill: () => Promise.resolve(null),
        });
      },
    });
    const manager = _manager([
      {
        manifest: _fixtureManifest(),
        load: () => Promise.resolve({ default: plugin }),
      },
    ]);
    manager.initialize();
    const controller = new AbortController();
    const call = manager.callTool({
      pluginId: "fixture.plugin",
      providerId: "fixture.tools",
      context,
      toolRef: "wait",
      arguments: {},
      signal: controller.signal,
    });
    controller.abort();

    await _expectError(call, "cancelled");
  });

  test("validates and reloads a local plugin by file modification identity", async () => {
    const root = _temporaryRoot();
    const manifestPath = path.join(root, "llm-space.plugin.json");
    const runtimePath = path.join(root, "index.mjs");
    _writeLocalManifest(manifestPath, "1.0.0");
    _writeLocalRuntime(runtimePath, "v1");
    const manager = _manager([], [root]);
    manager.initialize();

    expect(manager.listPlugins()[0]).toMatchObject({
      version: "1.0.0",
      state: "inactive",
    });
    const first = await manager.importSource({
      pluginId: "fixture.local",
      importerId: "fixture.source",
      source: { kind: "path", path: "/fixture" },
    });
    expect((first.thread as { title: string }).title).toBe("v1");

    _writeLocalManifest(manifestPath, "1.1.0");
    _writeLocalRuntime(runtimePath, "v2");
    await manager.reload("fixture.local");
    expect(manager.listPlugins()[0]).toMatchObject({
      version: "1.1.0",
      state: "active",
    });
    const second = await manager.importSource({
      pluginId: "fixture.local",
      importerId: "fixture.source",
      source: { kind: "path", path: "/fixture" },
    });
    expect((second.thread as { title: string }).title).toBe("v2");
  });

  test("marks a missing local runtime invalid before activation", () => {
    const root = _temporaryRoot();
    _writeLocalManifest(path.join(root, "llm-space.plugin.json"), "1.0.0");
    const manager = _manager([], [root]);
    manager.initialize();

    expect(manager.listPlugins()[0]).toMatchObject({ state: "invalid" });
    expect(manager.listPlugins()[0]?.diagnostics[0]?.message).toContain(
      "runtime entry does not exist"
    );
  });

  test("runs context migration on a clone and keeps the original recoverable", async () => {
    const context = _fixtureContext();
    const plugin = definePlugin<Thread>({
      activate(registrar) {
        _registerFixtureContributions(registrar, context);
      },
      migrateContext(clone) {
        clone.data.migrated = true;
        throw new Error("migration rejected");
      },
    });
    const manager = _manager([
      {
        manifest: _fixtureManifest(),
        load: () => Promise.resolve({ default: plugin }),
      },
    ]);
    manager.initialize();

    await _expectError(manager.migrateContext(context), "migration rejected");
    expect(context.data).toEqual({ root: "/fixture" });
  });
});

async function _expectError(
  promise: Promise<unknown>,
  message: string
): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect((caught as Error).message).toContain(message);
}

function _manager(
  bundledPlugins: readonly BundledPlugin<Thread>[],
  localPaths: string[] = []
): PluginManager<Thread> {
  const root = _temporaryRoot();
  return new PluginManager<Thread>({
    apiVersion: "1.0.0",
    engineVersion: "0.0.1",
    bundledPlugins,
    localPaths,
    settingsPath: path.join(root, "settings", "plugins.json"),
    storageRoot: path.join(root, "plugins"),
    operationTimeoutMs: 1_000,
  });
}

function _fixtureManifest(): PluginManifest {
  return {
    id: "fixture.plugin",
    name: "Fixture plugin",
    version: "1.0.0",
    runtime: "./index.ts",
    apiVersion: "1.0.0",
    engines: { llmSpace: ">=0.0.1" },
    source: "bundled",
    capabilities: ["storage"],
    contributions: [
      { kind: "sourceImporter", id: "fixture.source", name: "Source" },
      { kind: "toolProvider", id: "fixture.tools", name: "Tools" },
      { kind: "skillProvider", id: "fixture.skills", name: "Skills" },
    ],
  };
}

function _fixtureContext(): PluginContext {
  return {
    contextId: "fixture-context",
    pluginId: "fixture.plugin",
    sourceId: "fixture.source",
    schemaVersion: 1,
    label: "Fixture",
    data: { root: "/fixture" },
    toolProviderId: "fixture.tools",
    skillProviderId: "fixture.skills",
  };
}

function _fixtureThread(context: PluginContext): Thread {
  return {
    title: "Fixture",
    context: {
      plugins: [context],
      messages: [],
    },
  };
}

function _registerFixtureContributions(
  registrar: import("@llm-space/plugin-api").PluginRegistrar<Thread>,
  context: PluginContext
): void {
  registrar.registerSourceImporter("fixture.source", {
    importSource: () =>
      Promise.resolve({
        thread: _fixtureThread(context),
        contexts: [context],
        diagnostics: [],
      }),
  });
  registrar.registerToolProvider("fixture.tools", {
    listTools: () => Promise.resolve([]),
    callTool: () => Promise.resolve({ contentText: "", isError: false }),
  });
  registrar.registerSkillProvider("fixture.skills", {
    listSkills: () => Promise.resolve([]),
    readSkill: () => Promise.resolve(null),
  });
}

function _temporaryRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "llm-space-plugin-test-"));
  temporaryRoots.push(root);
  return root;
}

function _writeLocalManifest(filePath: string, version: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    JSON.stringify({
      id: "fixture.local",
      name: "Local fixture",
      version,
      runtime: "./index.mjs",
      apiVersion: "1.0.0",
      engines: { llmSpace: ">=0.0.1" },
      source: "local",
      capabilities: [],
      contributions: [
        { kind: "sourceImporter", id: "fixture.source", name: "Source" },
      ],
    }),
    "utf8"
  );
}

function _writeLocalRuntime(filePath: string, title: string): void {
  writeFileSync(
    filePath,
    `export default {
      activate(registrar) {
        registrar.registerSourceImporter("fixture.source", {
          async importSource() {
            return {
              thread: { title: ${JSON.stringify(title)}, context: { messages: [] } },
              contexts: [],
              diagnostics: []
            };
          }
        });
      }
    };\n`,
    "utf8"
  );
}
