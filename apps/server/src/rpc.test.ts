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
    readTextFile: (path: string) => Promise.resolve(`remote:${path}`),
    textFileExists: (path: string) => Promise.resolve(path === "/remote.md"),
    fsWrite: () => Promise.resolve(),
    createSubagentThread: () =>
      Promise.resolve({
        path: "project/tasks/parent-review.json",
        status: "created",
        message: "Created, not yet run.",
      }),
    fsArchiveRun: (_path, run) =>
      Promise.resolve({
        id: run.id,
        timestamp: run.timestamp,
        usage: run.usage,
        snapshotRef: `${"a".repeat(64)}.json`,
        preview: {
          summary: "Archived",
          modelLabel: "No model",
          messageCountLabel: "0 messages",
        },
      }),
    fsReadRunSnapshot: () => Promise.resolve({ title: "Archived" }),
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
      exaApiKey: "",
      anysearchApiKey: "",
      zhihuAccessSecret: "",
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
    addProviderProfile: () => Promise.resolve([]),
    updateProviderProfile: () => Promise.resolve([]),
    removeProviderProfile: () => Promise.resolve([]),
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
    mcpCancelTest: () => Promise.resolve([]),
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
    mcpCallTool: () => Promise.resolve({ content: [] }),
    builtInCallTool: () => Promise.resolve({ content: [] }),
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
    skillsSetPluginSkillHidden: () => ({ discoveryPaths: [] }),
    skillsSetAllPluginSkillsHidden: () => ({ discoveryPaths: [] }),
    skillsSetAllSkillsHidden: () => ({ discoveryPaths: [] }),
    skillsListAvailable: () => [],
    skillsListPluginSkills: () => [],
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

  test("forwards an ephemeral provider connection to built-in tool calls", async () => {
    const runtime = createRuntime();
    let received: Parameters<RuntimeClient["builtInCallTool"]>[0] | undefined;
    runtime.builtInCallTool = (input) => {
      received = input;
      return Promise.resolve({ content: [] });
    };

    await handleRuntimeRpc(runtime, {
      id: "1",
      method: "builtinTools.call",
      params: {
        name: "generate_image",
        arguments: { prompt: "fixture" },
        config: { model: "seedream-fixture" },
        connection: { providerId: "ark", profileId: "profile-work" },
      },
    });

    expect(received).toEqual({
      name: "generate_image",
      arguments: { prompt: "fixture" },
      config: { model: "seedream-fixture" },
      connection: { providerId: "ark", profileId: "profile-work" },
    });
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

  test("dispatches prompt text reads and readable-file checks", async () => {
    expect(
      await handleRuntimeRpc(createRuntime(), {
        id: "read",
        method: "fs.readText",
        params: { path: "/same/path.md" },
      })
    ).toEqual({ id: "read", ok: true, result: "remote:/same/path.md" });

    expect(
      await handleRuntimeRpc(createRuntime(), {
        id: "exists",
        method: "fs.textFileExists",
        params: { path: "/remote.md" },
      })
    ).toEqual({ id: "exists", ok: true, result: true });
  });

  test("dispatches run snapshot archive and lazy reads", async () => {
    const archived = await handleRuntimeRpc(createRuntime(), {
      id: "archive",
      method: "fs.archiveRun",
      params: {
        path: "thread.json",
        run: { id: "run-1", timestamp: 1, thread: { title: "Snapshot" } },
      },
    });
    expect(archived).toMatchObject({
      id: "archive",
      ok: true,
      result: { id: "run-1", preview: { summary: "Archived" } },
    });

    expect(
      await handleRuntimeRpc(createRuntime(), {
        id: "read-run",
        method: "fs.readRunSnapshot",
        params: {
          path: "thread.json",
          snapshotRef: `${"a".repeat(64)}.json`,
        },
      })
    ).toEqual({
      id: "read-run",
      ok: true,
      result: { title: "Archived" },
    });
  });

  test("validates prompt-file paths before dispatch", async () => {
    for (const method of ["fs.readText", "fs.textFileExists"]) {
      expect(
        await handleRuntimeRpc(createRuntime(), {
          id: method,
          method,
          params: { path: 123 },
        })
      ).toMatchObject({
        id: method,
        ok: false,
        error: { code: "invalid_params" },
      });
    }
  });
});


test("routes child creation with the supplied current snapshot", async () => {
  const runtime = createRuntime();
  let received: unknown;
  runtime.createSubagentThread = (input) => {
    received = input;
    return Promise.resolve({
      path: "project/tasks/parent-review.json",
      status: "created",
      message: "Created, not yet run.",
    });
  };
  const params = {
    parentPath: "project/parent.json",
    thread: { context: { systemPrompt: "Unsaved" } },
    arguments: {
      description: "Review code",
      task_name: "review",
      prompt: "Review it",
    },
  };
  const result = await handleRuntimeRpc(runtime, {
    id: "child",
    method: "fs.createSubagentThread",
    params,
  });
  expect(result).toMatchObject({ ok: true, result: { status: "created" } });
  expect(received).toMatchObject(params);
  expect(
    await handleRuntimeRpc(runtime, {
      id: "bad",
      method: "fs.createSubagentThread",
      params: {
        ...params,
        arguments: { ...params.arguments, task_name: "../bad" },
      },
    }),
  ).toMatchObject({ ok: false });
});
