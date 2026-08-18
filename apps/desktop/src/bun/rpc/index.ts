import {
  resolveUserPath,
  userDirectoryExists,
} from "@llm-space/core/server";
import type { GistThreadWriter } from "@llm-space/core/storage";
import {
  installPluginZip,
  type PluginManager,
} from "@llm-space/runtime/plugins";
import { BrowserView, Utils, type BrowserWindow } from "electrobun/bun";

import type { Command } from "../../shared/commands";
import type { DesktopRPCType } from "../../shared/rpc";
import type { Analytics } from "../analytics";
import type { GitHubAuthManager } from "../auth";
import {
  checkUv,
  openGeneratorDevTerminal,
  prepareGeneratorDir,
  removeProjectFile,
  runUv,
  writeProjectFile,
} from "../fs";
import type { LocalStorageManager } from "../local-storage";
import type { PluginCommandExecutionController } from "../plugins/plugin-command-execution-controller";
import {
  dismissGithubStarReminder,
  getNextFeatureReminder,
  markFeatureReminderSeen,
  resolveGithubStarReminder,
} from "../reminders";
import type { RemoteServerManager } from "../remote";
import type { RuntimeRouter } from "../runtime";
import type { SkillsManager } from "../skills";
import type { UpdaterService } from "../updates";

import { ensureRootDir } from "./ensure-root-dir";
import { fsReveal } from "./fs-reveal";
import { createPromptFileRpcHandlers } from "./prompt-files";
import { createShareThreadHandler } from "./share-thread";
import { forwardStreamThread } from "./stream-thread-request";
import { readSystemInfo } from "./system-info";

/**
 * The stream handler references its RPC instance inside the initializer, so an
 * explicit annotation keeps TypeScript from inferring the recursive value as
 * `any`.
 */
export type MainWindowRPC = ReturnType<
  typeof BrowserView.defineRPC<DesktopRPCType>
>;

export interface MainWindowRPCDependencies {
  analytics: Analytics;
  executeCommand: (command: Command) => void;
  /** Cancel the in-flight deep-link shared-thread import (Cancel button). */
  onCancelSharedImport: () => void;
  /** Release buffered launch URLs once the renderer listener is attached. */
  onDeepLinkReady: () => void;
  githubAuth: GitHubAuthManager;
  getMainWindow: () => BrowserWindow;
  /** Publishes a thread as a secret gist for the `shareThread` request. */
  gistWriter: GistThreadWriter;
  homePath: string;
  localStorageManager: LocalStorageManager;
  runtimeRouter: RuntimeRouter;
  remoteServerManager: RemoteServerManager;
  skillsManager: SkillsManager;
  updater: UpdaterService;
  pluginManager: PluginManager;
  pluginCommandExecutions: PluginCommandExecutionController;
}

const MAX_REQUEST_TIME_MS = 5 * 60_000 + 10_000;

export function createMainWindowRPC({
  analytics,
  executeCommand,
  onCancelSharedImport,
  onDeepLinkReady,
  githubAuth,
  getMainWindow,
  gistWriter,
  homePath,
  localStorageManager,
  runtimeRouter,
  remoteServerManager,
  skillsManager,
  updater,
  pluginManager,
  pluginCommandExecutions,
}: MainWindowRPCDependencies): MainWindowRPC {
  const getRuntime = runtimeRouter.get.bind(runtimeRouter);
  const promptFileRequests = createPromptFileRpcHandlers(getRuntime);
  const rpc: MainWindowRPC = BrowserView.defineRPC<DesktopRPCType>({
    maxRequestTime: MAX_REQUEST_TIME_MS,
    handlers: {
      requests: {
        listRuntimes: () => Promise.resolve(runtimeRouter.list()),
        getDefaultRuntime: () =>
          Promise.resolve({ runtimeId: runtimeRouter.getDefaultRuntimeId() }),
        systemInfo: () => Promise.resolve(readSystemInfo()),
        remoteListServers: () =>
          Promise.resolve(remoteServerManager.listServers()),
        remoteAddServer: ({ server }) =>
          Promise.resolve(remoteServerManager.addServer(server)),
        remoteUpdateServer: ({ serverId, server }) =>
          Promise.resolve(remoteServerManager.updateServer(serverId, server)),
        remoteRemoveServer: ({ serverId }) =>
          remoteServerManager.removeServer(serverId),
        remoteConnectServer: ({ serverId }) =>
          remoteServerManager.connectServer(serverId),
        remoteTrustServerHostKey: ({ serverId, requestId }) =>
          remoteServerManager.trustServerHostKey(serverId, requestId),
        remoteRejectServerHostKey: ({ serverId, requestId }) =>
          remoteServerManager.rejectServerHostKey(serverId, requestId),
        remoteDisconnectServer: ({ serverId }) =>
          remoteServerManager.disconnectServer(serverId),
        remoteSetDefaultRuntime: ({ runtimeId }) =>
          Promise.resolve(remoteServerManager.setDefaultRuntime(runtimeId)),
        remoteGetDefaultRuntime: () =>
          Promise.resolve({
            runtimeId: remoteServerManager.getDefaultRuntime(),
          }),

        availableModels: async ({ runtimeId }) =>
          getRuntime(runtimeId).availableModels(),
        removeProvider: async ({ runtimeId, providerId }) =>
          getRuntime(runtimeId).removeProvider(providerId),
        builtinProviders: ({ runtimeId }) =>
          getRuntime(runtimeId).builtinProviders(),
        addProvider: async ({ runtimeId, providerId }) => {
          const groups = await getRuntime(runtimeId).addProvider(providerId);
          analytics.capture("provider_added", { providerId, kind: "builtin" });
          return groups;
        },
        addCustomProvider: async ({ runtimeId, id, name, baseUrl, api }) => {
          const groups = await getRuntime(runtimeId).addCustomProvider({
            id,
            name,
            baseUrl,
            api,
          });
          // Only the provider id is recorded — never the base URL or name.
          analytics.capture("provider_added", {
            providerId: id,
            kind: "custom",
          });
          return groups;
        },
        addProviderProfile: ({ runtimeId, providerId }) =>
          getRuntime(runtimeId).addProviderProfile(providerId),
        updateProviderProfile: (input) =>
          getRuntime(input.runtimeId).updateProviderProfile(input),
        removeProviderProfile: (input) =>
          getRuntime(input.runtimeId).removeProviderProfile(input),
        updateProvider: (input) =>
          getRuntime(input.runtimeId).updateProvider(input),
        setModelEnabled: (input) =>
          getRuntime(input.runtimeId).setModelEnabled(input),
        setAllModelsEnabled: (input) =>
          getRuntime(input.runtimeId).setAllModelsEnabled(input),
        getDefaultModel: ({ runtimeId }) =>
          getRuntime(runtimeId).getDefaultModel(),
        setDefaultModel: ({ runtimeId, model }) =>
          getRuntime(runtimeId).setDefaultModel(model),
        testModelConnection: async ({
          runtimeId,
          providerId,
          profileId,
          modelId,
          candidate,
        }) => {
          await getRuntime(runtimeId).testModelConnection({
            providerId,
            profileId,
            modelId,
            candidate,
          });
          return null;
        },
        removeCustomModel: ({ runtimeId, providerId, modelId }) =>
          getRuntime(runtimeId).removeCustomModel({ providerId, modelId }),
        upsertCustomModel: ({ runtimeId, providerId, model, originalId }) =>
          getRuntime(runtimeId).upsertCustomModel({
            providerId,
            model,
            originalId,
          }),
        toggleMaximized: () => {
          const mainWindow = getMainWindow();
          if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
          } else {
            mainWindow.maximize();
          }
          return { maximized: mainWindow.isMaximized() };
        },
        isFullScreen: () => {
          const mainWindow = getMainWindow();
          return { fullScreen: mainWindow.isFullScreen() };
        },
        localStorageGet: () => Promise.resolve(localStorageManager.snapshot()),
        localStorageInitialize: ({ values }) => {
          _assertLocalStorageValues(values);
          return Promise.resolve(localStorageManager.initialize(values));
        },
        localStorageSet: ({ key, value }) => {
          _assertLocalStorageKey(key);
          localStorageManager.setItem(key, value);
          return Promise.resolve(null);
        },
        localStorageRemove: ({ key }) => {
          _assertLocalStorageKey(key);
          localStorageManager.removeItem(key);
          return Promise.resolve(null);
        },
        ensureRootDir: ({ relativePath }) => {
          const dir = ensureRootDir(homePath, relativePath);
          return Promise.resolve({ path: dir });
        },
        fsLs: ({ runtimeId, path }) => getRuntime(runtimeId).fsLs(path),
        fsMkdir: async ({ runtimeId, path }) => {
          await getRuntime(runtimeId).fsMkdir(path);
          return null;
        },
        fsCp: async ({ runtimeId, src, dest }) => {
          await getRuntime(runtimeId).fsCp(src, dest);
          return null;
        },
        fsMv: async ({ runtimeId, src, dest }) => {
          await getRuntime(runtimeId).fsMv(src, dest);
          return null;
        },
        fsRm: async ({ runtimeId, path }) => {
          await getRuntime(runtimeId).fsRm(path);
          return null;
        },
        fsRead: ({ runtimeId, path }) => getRuntime(runtimeId).fsRead(path),
        fsWrite: async ({ runtimeId, path, thread }) => {
          await getRuntime(runtimeId).fsWrite(path, thread);
          return null;
        },
        fsArchiveRun: ({ runtimeId, path, run }) =>
          getRuntime(runtimeId).fsArchiveRun(path, run),
        fsReadRunSnapshot: ({ runtimeId, path, snapshotRef }) =>
          getRuntime(runtimeId).fsReadRunSnapshot(path, snapshotRef),
        pluginsList: () => Promise.resolve(pluginManager.listPlugins()),
        pluginsRefresh: () => pluginManager.refreshPlugins(),
        pluginsInstallZip: async ({ fileName, dataBase64 }) => {
          if (!fileName.toLowerCase().endsWith(".zip")) {
            throw new Error("Only .zip plugin packages can be installed.");
          }
          const result = await installPluginZip({
            homePath,
            archive: Buffer.from(dataBase64, "base64"),
          });
          const plugins = await pluginManager.refreshPlugins();
          return { ...result, plugins };
        },
        pluginsReload: async ({ pluginId }) => {
          await pluginManager.reloadPlugin(pluginId);
          return pluginManager.listPlugins();
        },
        pluginsUninstall: ({ pluginId }) =>
          pluginManager.uninstallPlugin(pluginId),
        pluginsSetEnabled: ({ pluginId, enabled }) =>
          pluginManager.setEnabled(pluginId, enabled),
        pluginsSetSettings: ({ pluginId, settings }) =>
          pluginManager.setSettings(pluginId, settings),
        pluginCommandsList: () =>
          Promise.resolve(pluginManager.commands.list()),
        pluginCommandExecute: ({
          executionId,
          commandId,
          arguments: args,
          activeTab,
        }) =>
          pluginCommandExecutions.execute({
            executionId,
            commandId,
            arguments: args,
            context: { activeTab },
          }),
        pluginToolsList: () => Promise.resolve(pluginManager.tools.list()),
        pluginToolExecute: ({ tool, thread, variables, arguments: args }) =>
          pluginManager.tools.execute(tool, { thread, variables }, args),
        threadStoragesList: () =>
          Promise.resolve(pluginManager.threadStorages.list()),
        threadStorageResolveLatest: ({ storageId, resourceId }) =>
          pluginManager.threadStorages.resolveLatest(storageId, resourceId),
        threadStorageRead: ({ storageId, locator }) =>
          pluginManager.threadStorages.read(storageId, locator),
        threadStorageWrite: ({ storageId, thread, resourceId }) =>
          pluginManager.threadStorages.write(storageId, thread, resourceId),
        // Publish a thread as a secret gist and return its web viewer link.
        // `title`/`description` override the shared copy's display metadata
        // without touching the local thread file. The writer throws when signed
        // out or on a gist API failure; the error propagates to the renderer,
        // which maps it to friendly copy. Each call creates a fresh gist (no id
        // reuse), so a re-share yields a new link.
        shareThread: createShareThreadHandler({ getRuntime, gistWriter }),
        fsReveal: async ({ path }) => {
          await fsReveal(path, { skillsManager });
          return null;
        },
        fsRealpath: async ({ runtimeId, path }) => ({
          path: await getRuntime(runtimeId).fsRealpath(path),
        }),
        // Unconfined prompt-file access (any path + `~`) stays on its owner.
        ...promptFileRequests,
        fsDirectoryExists: async ({ path }) => ({
          exists: await userDirectoryExists(path),
        }),
        fsResolveUserPath: ({ path }) =>
          Promise.resolve({ path: resolveUserPath(path) }),
        // Native file picker for a "file content" prompt variable.
        fsPickFile: async () => {
          const selected = await Utils.openFileDialog({
            startingFolder: "~/",
            canChooseFiles: true,
            canChooseDirectory: false,
            allowsMultipleSelection: false,
          });
          const path = selected.map((p) => p.trim()).find(Boolean) ?? null;
          return { path };
        },
        // Native directory picker for the built-in working-directory variable.
        fsPickDirectory: async () => {
          const selected = await Utils.openFileDialog({
            startingFolder: "~/",
            canChooseFiles: false,
            canChooseDirectory: true,
            allowsMultipleSelection: false,
          });
          const path = selected.map((p) => p.trim()).find(Boolean) ?? null;
          return { path };
        },
        // --- Code generator ---
        generatorPickDirectory: async () => {
          const selected = await Utils.openFileDialog({
            startingFolder: "~/",
            canChooseFiles: false,
            canChooseDirectory: true,
            allowsMultipleSelection: false,
          });
          const path = selected.map((p) => p.trim()).find(Boolean) ?? null;
          return { path };
        },
        generatorPrepareDirectory: ({ parentDir, projectName }) =>
          prepareGeneratorDir(parentDir, projectName),
        generatorCheckUv: () => checkUv(),
        generatorRunUv: ({ rootDir, args, timeoutMs }) =>
          runUv(rootDir, args, { timeoutMs }),
        generatorWriteFile: async ({ rootDir, relativePath, contents }) => {
          await writeProjectFile(rootDir, relativePath, contents);
          return null;
        },
        generatorRemoveFile: async ({ rootDir, relativePath }) => {
          await removeProjectFile(rootDir, relativePath);
          return null;
        },
        generatorOpenDevTerminal: ({ rootDir }) =>
          openGeneratorDevTerminal(rootDir),
        generatorResolveEnv: ({ runtimeId, providerId, profileId, envNames }) =>
          getRuntime(runtimeId).resolveGeneratorEnv({
            providerId,
            profileId,
            envNames,
          }),
        mcpListServers: ({ runtimeId }) =>
          getRuntime(runtimeId).mcpListServers(),
        mcpAddServer: async ({ runtimeId, server }) => {
          const servers = await getRuntime(runtimeId).mcpAddServer(server);
          analytics.capture("mcp_server_added", {});
          return servers;
        },
        mcpUpdateServer: ({ runtimeId, serverId, server }) =>
          getRuntime(runtimeId).mcpUpdateServer(serverId, server),
        mcpRemoveServer: ({ runtimeId, serverId }) =>
          getRuntime(runtimeId).mcpRemoveServer(serverId),
        mcpDisconnectServer: ({ runtimeId, serverId }) =>
          getRuntime(runtimeId).mcpDisconnectServer(serverId),
        mcpCancelTest: ({ runtimeId, serverId }) =>
          getRuntime(runtimeId).mcpCancelTest(serverId),
        mcpListTools: ({ runtimeId, serverId }) =>
          getRuntime(runtimeId).mcpListTools(serverId),
        mcpCallTool: ({ runtimeId, serverId, toolName, arguments: args }) =>
          getRuntime(runtimeId).mcpCallTool({
            serverId,
            toolName,
            arguments: args,
          }),
        builtInListTools: ({ runtimeId }) =>
          Promise.resolve(getRuntime(runtimeId).builtInListTools()),
        builtInCallTool: ({
          runtimeId,
          name,
          arguments: args,
          config,
          connection,
        }) =>
          getRuntime(runtimeId).builtInCallTool({
            name,
            arguments: args,
            config,
            connection,
          }),
        getAnalyticsSettings: () => Promise.resolve(analytics.getSettings()),
        setAnalyticsSettings: ({ enabled }) =>
          Promise.resolve(analytics.setEnabled(enabled)),
        getSearchSettings: ({ runtimeId }) =>
          Promise.resolve(getRuntime(runtimeId).getSearchSettings()),
        setSearchSettings: ({ runtimeId, settings }) =>
          Promise.resolve(getRuntime(runtimeId).setSearchSettings(settings)),
        getNetworkSettings: ({ runtimeId }) =>
          Promise.resolve(getRuntime(runtimeId).getNetworkSettings()),
        setNetworkSettings: ({ runtimeId, settings }) =>
          Promise.resolve(getRuntime(runtimeId).setNetworkSettings(settings)),
        detectSystemProxy: ({ runtimeId }) =>
          Promise.resolve(getRuntime(runtimeId).detectSystemProxy()),
        skillsGetSettings: ({ runtimeId }) =>
          Promise.resolve(getRuntime(runtimeId).skillsGetSettings()),
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
        skillsAddPath: ({ runtimeId, path }) =>
          Promise.resolve(getRuntime(runtimeId).skillsAddPath(path)),
        skillsRemovePath: ({ runtimeId, path }) =>
          Promise.resolve(getRuntime(runtimeId).skillsRemovePath(path)),
        skillsSetSkillHidden: ({ runtimeId, path, skillName, hidden }) =>
          Promise.resolve(
            getRuntime(runtimeId).skillsSetSkillHidden({
              path,
              skillName,
              hidden,
            })
          ),
        skillsSetPluginSkillHidden: ({
          runtimeId,
          pluginId,
          skillName,
          hidden,
        }) =>
          Promise.resolve(
            getRuntime(runtimeId).skillsSetPluginSkillHidden({
              pluginId,
              skillName,
              hidden,
            })
          ),
        skillsSetAllPluginSkillsHidden: ({ runtimeId, pluginId, hidden }) =>
          Promise.resolve(
            getRuntime(runtimeId).skillsSetAllPluginSkillsHidden({
              pluginId,
              hidden,
            })
          ),
        skillsSetAllSkillsHidden: ({ runtimeId, path, hidden }) =>
          Promise.resolve(
            getRuntime(runtimeId).skillsSetAllSkillsHidden({ path, hidden })
          ),
        skillsListAvailable: ({ runtimeId }) =>
          Promise.resolve(getRuntime(runtimeId).skillsListAvailable()),
        skillsListPluginSkills: ({ runtimeId }) =>
          Promise.resolve(getRuntime(runtimeId).skillsListPluginSkills()),
        skillsListSkills: ({ runtimeId, path }) =>
          Promise.resolve(getRuntime(runtimeId).skillsListSkills(path)),
        skillsReadSkill: ({ runtimeId, path }) =>
          Promise.resolve(getRuntime(runtimeId).skillsReadSkill(path)),
        traceListProjects: ({ runtimeId }) =>
          Promise.resolve(getRuntime(runtimeId).traceListProjects()),
        traceCreateProject: ({ runtimeId, name }) =>
          Promise.resolve(getRuntime(runtimeId).traceCreateProject(name)),
        traceCreateConnectedProject: ({ runtimeId, ...input }) =>
          Promise.resolve(
            getRuntime(runtimeId).traceCreateConnectedProject(input)
          ),
        traceListTraces: ({ runtimeId, projectId }) =>
          Promise.resolve(getRuntime(runtimeId).traceListTraces(projectId)),
        traceImportLangfuseJson: ({ runtimeId, projectId, files }) =>
          Promise.resolve(
            getRuntime(runtimeId).traceImportLangfuseJson(projectId, files)
          ),
        traceSearchLangfuseTraces: ({ runtimeId, projectId, filters }) =>
          Promise.resolve(
            getRuntime(runtimeId).traceSearchLangfuseTraces({
              projectId,
              filters,
            })
          ),
        traceSyncLangfuseTraces: ({ runtimeId, projectId, traceIds }) =>
          Promise.resolve(
            getRuntime(runtimeId).traceSyncLangfuseTraces({
              projectId,
              traceIds,
            })
          ),
        traceReadTrace: ({ runtimeId, projectId, traceKey }) =>
          Promise.resolve(
            getRuntime(runtimeId).traceReadTrace(projectId, traceKey)
          ),
        traceReadOrCreateWorkbench: ({ runtimeId, projectId, traceKey }) =>
          Promise.resolve(
            getRuntime(runtimeId).traceReadOrCreateWorkbench(
              projectId,
              traceKey
            )
          ),
        traceUpdateTraceTitle: ({ runtimeId, projectId, traceKey, title }) =>
          Promise.resolve(
            getRuntime(runtimeId).traceUpdateTraceTitle(
              projectId,
              traceKey,
              title
            )
          ),
        traceWriteWorkbench: async ({
          runtimeId,
          projectId,
          traceKey,
          thread,
        }) => {
          await getRuntime(runtimeId).traceWriteWorkbench(
            projectId,
            traceKey,
            thread
          );
          return null;
        },
        updateMode: () => updater.getUpdateModeSetting(),
        setUpdateMode: async ({ mode }) => {
          await updater.setUpdateModeSetting(mode);
          return null;
        },
        pendingInstalledVersion: () => updater.getInstalledVersion(),
        githubStarReminderShouldShow: () => resolveGithubStarReminder(),
        githubStarReminderDismissForever: async () => {
          await dismissGithubStarReminder();
          return null;
        },
        featureReminderNext: () => getNextFeatureReminder(),
        featureReminderMarkSeen: async ({ id }) => {
          await markFeatureReminderSeen(id);
          return null;
        },
        githubAuthStatus: () => Promise.resolve(githubAuth.getState()),
      },
      messages: {
        sendStreamThreadRequest: (payload) => {
          // Fire-and-forget: stream events back as `receiveStreamThreadResponse`
          // messages. `rpc` is initialized by the time this handler runs.
          void forwardStreamThread(
            () => getRuntime(payload.runtimeId),
            payload,
            (message) => rpc.send.receiveStreamThreadResponse(message)
          );
        },
        abortStreamThread: (payload) =>
          getRuntime(payload.runtimeId).abortStream(payload),
        captureAnalyticsEvent: ({ event, properties }) =>
          analytics.capture(event, properties),
        executeCommand: (command) => executeCommand(command),
        cancelSharedImport: () => onCancelSharedImport(),
        deepLinkReady: () => onDeepLinkReady(),
      },
    },
  });
  return rpc;
}

function _assertLocalStorageKey(key: string): void {
  if (!key.startsWith("llm-space")) {
    throw new Error(`Unmanaged localStorage key: ${key}`);
  }
}

function _assertLocalStorageValues(values: Record<string, string>): void {
  for (const key of Object.keys(values)) _assertLocalStorageKey(key);
}
