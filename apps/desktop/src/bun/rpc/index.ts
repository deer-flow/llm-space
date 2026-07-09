import { mkdirSync } from "node:fs";
import path from "node:path";

import { ModelProviderGroup } from "@llm-space/core";
import { getLlmSpaceHomePath } from "@llm-space/core/server";
import { BrowserView, Utils } from "electrobun/bun";

import type { DesktopRPCType } from "../../shared/rpc";
import { analytics } from "../analytics";
import { moveToTrash, revealInFileManager } from "../fs";
import { mcpManager } from "../mcp";
import { modelManager } from "../models";
import { searchSettings } from "../search";
import { skillsManager } from "../skills";
import { localFs } from "../storage";
import {
  abortStreamThread,
  runStreamThread,
  testModelConnection,
} from "../streaming";
import { callBuiltInTool, listBuiltInTools } from "../tools/built-in";
import { traceManager } from "../traces";
import {
  getInstalledVersion,
  getUpdateModeSetting,
  setUpdateModeSetting,
} from "../updates";

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
          analytics.capture("provider_added", { providerId, kind: "builtin" });
          return getModelProviderGroups();
        },
        addCustomProvider: async ({ id, name, baseUrl, api }) => {
          modelManager.addCustomProvider({ id, name, baseUrl, api });
          // Only the provider id is recorded — never the base URL or name.
          analytics.capture("provider_added", { providerId: id, kind: "custom" });
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
        getDefaultModel: () => Promise.resolve(modelManager.getDefaultModel()),
        setDefaultModel: ({ model }) => {
          modelManager.setDefaultModel(model);
          return Promise.resolve(modelManager.getDefaultModel());
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
        ensureRootDir: ({ relativePath }) => {
          const dir = path.join(getLlmSpaceHomePath(), relativePath);
          mkdirSync(dir, { recursive: true });
          return Promise.resolve({ path: dir });
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
        fsRealpath: ({ path }) =>
          Promise.resolve({ path: localFs.realpath(path) }),
        mcpListServers: () => mcpManager.listServers(),
        mcpAddServer: ({ server }) => {
          const servers = mcpManager.addServer(server);
          analytics.capture("mcp_server_added", {});
          return servers;
        },
        mcpUpdateServer: async ({ serverId, server }) =>
          mcpManager.updateServer(serverId, server),
        mcpRemoveServer: async ({ serverId }) =>
          mcpManager.removeServer(serverId),
        mcpDisconnectServer: async ({ serverId }) =>
          mcpManager.disconnectServer(serverId),
        mcpListTools: async ({ serverId }) => mcpManager.listTools(serverId),
        mcpCallTool: async ({ serverId, toolName, arguments: args }) =>
          mcpManager.callTool({ serverId, toolName, arguments: args }),
        builtInListTools: () => listBuiltInTools(),
        builtInCallTool: ({ name, arguments: args }) =>
          callBuiltInTool({ name, arguments: args }),
        getAnalyticsSettings: () => Promise.resolve(analytics.getSettings()),
        setAnalyticsSettings: ({ enabled }) =>
          Promise.resolve(analytics.setEnabled(enabled)),
        getSearchSettings: () => searchSettings.get(),
        setSearchSettings: ({ settings }) => searchSettings.set(settings),
        skillsGetSettings: () => Promise.resolve(skillsManager.getConfig()),
        skillsBrowseForPath: async () => {
          const selected = await Utils.openFileDialog({
            startingFolder: "~/",
            canChooseFiles: false,
            canChooseDirectory: true,
            allowsMultipleSelection: false,
          });
          const path = selected.map((p) => p.trim()).find(Boolean) ?? null;
          return { path };
        },
        skillsAddPath: ({ path }) => Promise.resolve(skillsManager.addPath(path)),
        skillsRemovePath: ({ path }) =>
          Promise.resolve(skillsManager.removePath(path)),
        skillsSetSkillHidden: ({ path, skillName, hidden }) =>
          Promise.resolve(skillsManager.setSkillHidden(path, skillName, hidden)),
        skillsSetAllSkillsHidden: ({ path, hidden }) =>
          Promise.resolve(skillsManager.setAllSkillsHidden(path, hidden)),
        skillsListSkills: ({ path }) =>
          Promise.resolve(skillsManager.listSkills(path)),
        skillsReadSkill: ({ path }) =>
          Promise.resolve(skillsManager.readSkill(path)),
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
        updateMode: () => getUpdateModeSetting(),
        setUpdateMode: async ({ mode }) => {
          await setUpdateModeSetting(mode);
          return null;
        },
        pendingInstalledVersion: () => getInstalledVersion(),
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
        captureAnalyticsEvent: ({ event, properties }) =>
          analytics.capture(event, properties),
        executeCommand: async (command) => {
          const { executeCommandInBun } = await import("../commands");
          const { mainWindow } = await import("../app/window");
          executeCommandInBun(command, mainWindow);
        },
      },
    },
  });
