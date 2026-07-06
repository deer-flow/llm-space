import { ModelProviderGroup } from "@llm-space/core";
import { BrowserView } from "electrobun/bun";

import type { DesktopRPCType } from "../../shared/rpc";
import { moveToTrash, revealInFileManager } from "../fs";
import { mcpManager } from "../mcp";
import { modelManager } from "../models";
import { localFs } from "../storage";
import {
  abortStreamThread,
  runStreamThread,
  testModelConnection,
} from "../streaming";
import { traceManager } from "../traces";

async function getModelProviderGroups() {
  const models = await modelManager.getAvailableModels();
  return Promise.all(
    models.getProviders().map(async (provider) => ({
      id: provider.id,
      name: provider.name,
      builtin: modelManager.isBuiltin(provider.id),
      models: provider.getModels(),
      apiKey: await modelManager.getApiKey(provider.id, false),
      baseUrl: modelManager.getBaseUrl(provider.id),
      headers: modelManager.getHeaders(provider.id),
      api: modelManager.getApi(provider.id),
      disabledModels: modelManager.getDisabledModels(provider.id),
      customModels: modelManager.getCustomModels(provider.id),
      websiteLink: modelManager.getWebsiteLink(provider.id),
      icon: modelManager.getProviderIcon(provider.id),
    }))
  ) as Promise<ModelProviderGroup[]>;
}

/**
 * The handler for `sendStreamThreadRequest` references `mainWindowRPC` inside
 * its own initializer, so an explicit annotation is required — otherwise TS
 * infers `mainWindowRPC` (and everything built from it) as `any`.
 */
type MainWindowRPC = ReturnType<typeof BrowserView.defineRPC<DesktopRPCType>>;

const MAX_REQUEST_TIME_MS = 5 * 60_000 + 10_000;

export const mainWindowRPC: MainWindowRPC =
  BrowserView.defineRPC<DesktopRPCType>({
    maxRequestTime: MAX_REQUEST_TIME_MS,
    handlers: {
      requests: {
        availableModels: async () => getModelProviderGroups(),
        removeProvider: async ({ providerId }) => {
          modelManager.removeProvider(providerId);
          return getModelProviderGroups();
        },
        builtinProviders: async () => modelManager.getBuiltinProviders(),
        addProvider: async ({ providerId }) => {
          modelManager.addBuiltInProvider({ id: providerId });
          return getModelProviderGroups();
        },
        addCustomProvider: async ({ id, name, baseUrl, api }) => {
          modelManager.addCustomProvider({ id, name, baseUrl, api });
          return getModelProviderGroups();
        },
        updateProvider: async ({
          providerId,
          apiKey,
          baseUrl,
          headers,
          name,
          api,
          icon,
        }) => {
          modelManager.updateProvider(providerId, {
            apiKey,
            baseUrl,
            headers,
            name,
            api,
            icon,
          });
          return getModelProviderGroups();
        },
        setModelEnabled: async ({ providerId, modelId, enabled }) => {
          modelManager.setModelEnabled(providerId, modelId, enabled);
          return getModelProviderGroups();
        },
        setAllModelsEnabled: async ({ providerId, enabled }) => {
          modelManager.setAllModelsEnabled(providerId, enabled);
          return getModelProviderGroups();
        },
        testModelConnection: async ({ providerId, modelId }) => {
          await testModelConnection({ providerId, modelId });
          return null;
        },
        removeCustomModel: async ({ providerId, modelId }) => {
          modelManager.removeCustomModel(providerId, modelId);
          return getModelProviderGroups();
        },
        upsertCustomModel: async ({ providerId, model, originalId }) => {
          modelManager.upsertCustomModel(providerId, model, originalId);
          return getModelProviderGroups();
        },
        toggleMaximized: async () => {
          const { mainWindow } = await import("../app/window");
          if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
          } else {
            mainWindow.maximize();
          }
          return { maximized: mainWindow.isMaximized() };
        },
        isFullScreen: async () => {
          const { mainWindow } = await import("../app/window");
          return { fullScreen: mainWindow.isFullScreen() };
        },
        fsLs: ({ path }) => localFs.ls(path),
        fsMkdir: async ({ path }) => {
          await localFs.mkdir(path);
          return null;
        },
        fsCp: async ({ src, dest }) => {
          await localFs.cp(src, dest);
          return null;
        },
        fsMv: async ({ src, dest }) => {
          await localFs.mv(src, dest);
          return null;
        },
        fsRm: async ({ path }) => {
          // Recoverable delete: move to the OS trash rather than `rm`-ing.
          const abs = localFs.realpath(path);
          if (abs === localFs.realpath("")) {
            throw new Error("Cannot delete the workspace root.");
          }
          await moveToTrash(abs);
          return null;
        },
        fsRead: ({ path }) => localFs.read(path),
        fsWrite: async ({ path, thread }) => {
          await localFs.write(path, thread);
          return null;
        },
        fsReveal: async ({ path }) => {
          await revealInFileManager(localFs.realpath(path));
          return null;
        },
        mcpListServers: () => mcpManager.listServers(),
        mcpAddServer: ({ server }) => mcpManager.addServer(server),
        mcpUpdateServer: async ({ serverId, server }) =>
          mcpManager.updateServer(serverId, server),
        mcpRemoveServer: async ({ serverId }) =>
          mcpManager.removeServer(serverId),
        mcpDisconnectServer: async ({ serverId }) =>
          mcpManager.disconnectServer(serverId),
        mcpListTools: async ({ serverId }) => mcpManager.listTools(serverId),
        mcpCallTool: async ({ serverId, toolName, arguments: args }) =>
          mcpManager.callTool({ serverId, toolName, arguments: args }),
        traceListProjects: () => traceManager.listProjects(),
        traceCreateProject: ({ name }) => traceManager.createProject(name),
        traceCreateConnectedProject: (input) =>
          traceManager.createConnectedProject(input),
        traceListTraces: ({ projectId }) => traceManager.listTraces(projectId),
        traceImportLangfuseJson: ({ projectId, files }) =>
          traceManager.importLangfuseJson(projectId, files),
        traceSearchLangfuseTraces: ({ projectId, filters }) =>
          traceManager.searchLangfuseTraces({ projectId, filters }),
        traceSyncLangfuseTraces: ({ projectId, traceIds }) =>
          traceManager.syncLangfuseTraces({ projectId, traceIds }),
        traceReadTrace: ({ projectId, traceKey }) =>
          traceManager.readTrace(projectId, traceKey),
        traceReadOrCreateWorkbench: ({ projectId, traceKey }) =>
          traceManager.readOrCreateWorkbench(projectId, traceKey),
        traceUpdateTraceTitle: ({ projectId, traceKey, title }) =>
          traceManager.updateTraceTitle(projectId, traceKey, title),
        traceWriteWorkbench: async ({ projectId, traceKey, thread }) => {
          await traceManager.writeWorkbench(projectId, traceKey, thread);
          return null;
        },
      },
      messages: {
        sendStreamThreadRequest: (payload) => {
          // Fire-and-forget: stream events back as `receiveStreamThreadResponse`
          // messages. `mainWindowRPC` is assigned by the time this handler runs.
          void runStreamThread(payload, (message) =>
            mainWindowRPC.send.receiveStreamThreadResponse(message)
          );
        },
        abortStreamThread: (payload) => abortStreamThread(payload),
        executeCommand: async (command) => {
          const { executeCommandInBun } = await import("../commands");
          const { mainWindow } = await import("../app/window");
          executeCommandInBun(command, mainWindow);
        },
      },
    },
  });
