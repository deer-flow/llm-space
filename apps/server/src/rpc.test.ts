import { describe, expect, test } from "bun:test";

import type { RuntimeClient } from "@llm-space/runtime/runtime";

import { handleRuntimeRpc } from "./rpc";

function createRuntime(): RuntimeClient {
  return {
    info: () => ({
      id: "local",
      kind: "local",
      name: "Test",
      status: "connected",
      capabilities: ["filesystem"],
    }),
    fsMkdir: () => Promise.resolve(),
    fsLs: () => Promise.resolve([]),
    fsRead: () => Promise.resolve({ title: "Read" }),
    fsWrite: () => Promise.resolve(),
    fsRealpath: (path) => Promise.resolve(`/tmp/${path}`),
    availableModels: () => Promise.resolve([]),
    builtinProviders: () => Promise.resolve([]),
    getDefaultModel: () => Promise.resolve(null),
    resolveGeneratorEnv: () =>
      Promise.resolve({ modelApiKey: "", envValues: {} }),
    mcpListServers: () => [],
    builtInListTools: () => [],
    getSearchSettings: () => ({
      provider: "firecrawl",
      braveApiKey: "",
      firecrawlApiKey: "",
      tavilyApiKey: "",
    }),
    getNetworkSettings: () => ({
      enabled: false,
      useSystemProxy: false,
      httpProxy: "",
      httpsProxy: "",
      noProxy: "",
    }),
    skillsGetSettings: () => ({ discoveryPaths: [] }),
    removeProvider: () => Promise.resolve([]),
    addProvider: () => Promise.resolve([]),
    addCustomProvider: () => Promise.resolve([]),
    updateProvider: () => Promise.resolve([]),
    setModelEnabled: () => Promise.resolve([]),
    setAllModelsEnabled: () => Promise.resolve([]),
    setDefaultModel: () => Promise.resolve(null),
    testModelConnection: () => Promise.resolve(),
    removeCustomModel: () => Promise.resolve([]),
    upsertCustomModel: () => Promise.resolve([]),
    fsCp: () => Promise.resolve(),
    fsMv: () => Promise.resolve(),
    fsRm: () => Promise.resolve(),
    mcpAddServer: () => [],
    mcpUpdateServer: () => Promise.resolve([]),
    mcpRemoveServer: () => Promise.resolve([]),
    mcpDisconnectServer: () => Promise.resolve([]),
    mcpListTools: () =>
      Promise.resolve({
        server: {
          id: "s",
          serverName: "s",
          name: "s",
          transport: "stdio",
          command: "x",
          args: [],
          cwd: "",
          env: {},
          createdAt: 0,
          updatedAt: 0,
          readiness: { status: "untested", testedAt: 0 },
        },
        tools: [],
      }) as never,
    mcpCallTool: () => Promise.resolve({ contentText: "" }),
    builtInCallTool: () => Promise.resolve({ contentText: "" }),
    setSearchSettings: (settings) => settings,
    setNetworkSettings: (settings) => settings,
    detectSystemProxy: () => ({
      supported: false,
      httpProxy: null,
      httpsProxy: null,
      noProxy: null,
      socksOnly: false,
    }),
    skillsAddPath: () => ({ discoveryPaths: [] }),
    skillsRemovePath: () => ({ discoveryPaths: [] }),
    skillsSetSkillHidden: () => ({ discoveryPaths: [] }),
    skillsSetAllSkillsHidden: () => ({ discoveryPaths: [] }),
    skillsListSkills: () => [],
    skillsReadSkill: () => ({ frontmatters: {}, content: "", path: "" }),
    traceListProjects: () => [],
    traceCreateProject: (name) => ({
      id: "p",
      name,
      source: { type: "langfuse", mode: "manual" },
      createdAt: 0,
      updatedAt: 0,
    }),
    traceCreateConnectedProject: (input) => ({
      id: "p",
      name: input.name ?? "p",
      source: {
        type: "langfuse",
        mode: "connected",
        baseUrl: input.baseUrl,
        publicKeyPreview: "pk…",
        secretKeyPreview: "sk…",
      },
      createdAt: 0,
      updatedAt: 0,
    }),
    traceListTraces: () => [],
    traceImportLangfuseJson: () => ({ imported: [], warnings: [], skipped: 0 }),
    traceSearchLangfuseTraces: () => [],
    traceSyncLangfuseTraces: () => ({ imported: [], warnings: [], skipped: 0 }),
    traceReadTrace: (_projectId, traceKey) => ({
      id: "t",
      key: traceKey,
      projectId: "p",
      title: traceKey,
      observationCount: 0,
      importedAt: 0,
      updatedAt: 0,
      source: { type: "langfuse", mode: "manual", traceId: traceKey },
    }),
    traceReadOrCreateWorkbench: (_projectId, traceKey) => ({
      trace: {
        id: "t",
        key: traceKey,
        projectId: "p",
        title: traceKey,
        observationCount: 0,
        importedAt: 0,
        updatedAt: 0,
        source: { type: "langfuse", mode: "manual", traceId: traceKey },
      },
      thread: { title: traceKey },
    }),
    traceUpdateTraceTitle: (_projectId, traceKey, title) => ({
      trace: {
        id: "t",
        key: traceKey,
        projectId: "p",
        title,
        observationCount: 0,
        importedAt: 0,
        updatedAt: 0,
        source: { type: "langfuse", mode: "manual", traceId: traceKey },
      },
      thread: { title },
    }),
    traceWriteWorkbench: () => undefined,
    streamThread: () => Promise.resolve(),
    abortStream: () => undefined,
    shutdown: () => undefined,
  };
}

describe("handleRuntimeRpc", () => {
  test("dispatches runtime.info", async () => {
    expect(
      await handleRuntimeRpc(createRuntime(), {
        id: "1",
        method: "runtime.info",
      })
    ).toMatchObject({ id: "1", ok: true, result: { name: "Test" } });
  });

  test("returns method_not_found for unknown methods", async () => {
    expect(
      await handleRuntimeRpc(createRuntime(), {
        id: "1",
        method: "missing.method",
      })
    ).toMatchObject({
      id: "1",
      ok: false,
      error: { code: "method_not_found" },
    });
  });
});
