import { stat } from "node:fs/promises";
import path from "node:path";

import { ModelProviderGroup } from "@llm-space/core";
import { expandHomePath, readUserTextFile } from "@llm-space/core/server";
import type { LocalFileSystem } from "@llm-space/core/server";
import {
  GIST_CONNECTOR_ID,
  type GistThreadWriter,
} from "@llm-space/core/storage";
import { BrowserView, Utils, type BrowserWindow } from "electrobun/bun";

import type { Command } from "../../shared/commands";
import type { DesktopRPCType } from "../../shared/rpc";
import { buildWebShareUrl } from "../../shared/share";
import type { Analytics } from "../analytics";
import type { GitHubAuthManager } from "../auth";
import {
  checkUv,
  moveToTrash,
  openPath,
  prepareGeneratorDir,
  removeProjectFile,
  revealInFileManager,
  runUv,
  writeProjectFile,
} from "../fs";
import type { McpManager } from "../mcp";
import type { ModelManager } from "../models";
import type { NetworkSettingsManager } from "../network";
import {
  dismissGithubStarReminder,
  getNextFeatureReminder,
  markFeatureReminderSeen,
  resolveGithubStarReminder,
} from "../reminders";
import type { SearchSettingsManager } from "../search";
import type { SkillsManager } from "../skills";
import type { StreamThreadController } from "../streaming";
import type { ToolRegistry } from "../tools/tool-registry";
import type { TraceManager } from "../traces";
import type { UpdaterService } from "../updates";

import { ensureRootDir } from "./ensure-root-dir";

async function _getModelProviderGroups(modelManager: ModelManager) {
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
  githubAuth: GitHubAuthManager;
  getMainWindow: () => BrowserWindow;
  /** Publishes a thread as a secret gist for the `shareThread` request. */
  gistWriter: GistThreadWriter;
  homePath: string;
  localFs: LocalFileSystem;
  mcpManager: McpManager;
  modelManager: ModelManager;
  networkSettings: NetworkSettingsManager;
  searchSettings: SearchSettingsManager;
  skillsManager: SkillsManager;
  streaming: StreamThreadController;
  tools: ToolRegistry;
  traceManager: TraceManager;
  updater: UpdaterService;
}

const MAX_REQUEST_TIME_MS = 5 * 60_000 + 10_000;

export function createMainWindowRPC({
  analytics,
  executeCommand,
  onCancelSharedImport,
  githubAuth,
  getMainWindow,
  gistWriter,
  homePath,
  localFs,
  mcpManager,
  modelManager,
  networkSettings,
  searchSettings,
  skillsManager,
  streaming,
  tools,
  traceManager,
  updater,
}: MainWindowRPCDependencies): MainWindowRPC {
  const getModelProviderGroups = () => _getModelProviderGroups(modelManager);
  const rpc: MainWindowRPC = BrowserView.defineRPC<DesktopRPCType>({
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
          analytics.capture("provider_added", {
            providerId: id,
            kind: "custom",
          });
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
        testModelConnection: async ({ providerId, modelId, candidate }) => {
          await streaming.testModelConnection({
            providerId,
            modelId,
            candidate,
          });
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
        ensureRootDir: ({ relativePath }) => {
          const dir = ensureRootDir(homePath, relativePath);
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
        // Publish a thread as a secret gist and return its web viewer link.
        // `title`/`description` override the shared copy's display metadata
        // without touching the local thread file. The writer throws when signed
        // out or on a gist API failure; the error propagates to the renderer,
        // which maps it to friendly copy. Each call creates a fresh gist (no id
        // reuse), so a re-share yields a new link.
        shareThread: async ({ path, title, description }) => {
          const thread = await localFs.read(path);
          const shared =
            title !== undefined ? { ...thread, title } : thread;
          const locator = await gistWriter.write(shared, undefined, {
            description,
          });
          return {
            gistId: locator.id,
            shareUrl: buildWebShareUrl(GIST_CONNECTOR_ID, locator.id),
          };
        },
        fsReveal: async ({ path }) => {
          await revealInFileManager(localFs.realpath(path));
          return null;
        },
        revealAbsolutePath: async ({ path: abs }) => {
          // Discovery-folder paths may be `~`-prefixed (e.g. `~/.claude/skills`),
          // so expand a leading tilde before stat/reveal.
          const resolved = expandHomePath(abs);
          try {
            await stat(resolved);
          } catch {
            return { existed: false };
          }
          await revealInFileManager(resolved);
          return { existed: true };
        },
        openAbsolutePath: async ({ path: abs }) => {
          try {
            await stat(abs);
          } catch {
            return { existed: false };
          }
          openPath(abs);
          return { existed: true };
        },
        revealSkill: async ({ name }) => {
          const found = skillsManager.findSkill(name, { enabledOnly: false });
          if (!found) {
            return { existed: false };
          }
          const file = path.join(found.path, "SKILL.md");
          try {
            await stat(file);
          } catch {
            return { existed: false };
          }
          await revealInFileManager(file);
          return { existed: true };
        },
        fsRealpath: ({ path }) =>
          Promise.resolve({ path: localFs.realpath(path) }),
        // Unconfined text read for the prompt `@include` macro (any path + `~`).
        fsReadText: async ({ path }) => ({
          text: await readUserTextFile(path),
        }),
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
        generatorRunUv: ({ rootDir, args }) => runUv(rootDir, args),
        generatorWriteFile: async ({ rootDir, relativePath, contents }) => {
          await writeProjectFile(rootDir, relativePath, contents);
          return null;
        },
        generatorRemoveFile: async ({ rootDir, relativePath }) => {
          await removeProjectFile(rootDir, relativePath);
          return null;
        },
        generatorResolveEnv: async ({ providerId, envNames }) => {
          const modelApiKey = (await modelManager.getApiKey(providerId, true)) ?? "";
          const envValues: Record<string, string> = {};
          for (const name of envNames) {
            envValues[name] = process.env[name] ?? "";
          }
          return { modelApiKey, envValues };
        },
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
        builtInListTools: () => tools.listTools(),
        builtInCallTool: ({ name, arguments: args }) =>
          tools.call({ name, arguments: args }),
        getAnalyticsSettings: () => Promise.resolve(analytics.getSettings()),
        setAnalyticsSettings: ({ enabled }) =>
          Promise.resolve(analytics.setEnabled(enabled)),
        getSearchSettings: () => searchSettings.get(),
        setSearchSettings: ({ settings }) => searchSettings.set(settings),
        getNetworkSettings: () => networkSettings.get(),
        setNetworkSettings: ({ settings }) => networkSettings.set(settings),
        detectSystemProxy: () => networkSettings.detectSystemProxy(),
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
        skillsAddPath: ({ path }) =>
          Promise.resolve(skillsManager.addPath(path)),
        skillsRemovePath: ({ path }) =>
          Promise.resolve(skillsManager.removePath(path)),
        skillsSetSkillHidden: ({ path, skillName, hidden }) =>
          Promise.resolve(
            skillsManager.setSkillHidden(path, skillName, hidden)
          ),
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
          void streaming.run(payload, (message) =>
            rpc.send.receiveStreamThreadResponse(message)
          );
        },
        abortStreamThread: (payload) => streaming.abort(payload),
        captureAnalyticsEvent: ({ event, properties }) =>
          analytics.capture(event, properties),
        executeCommand: (command) => executeCommand(command),
        cancelSharedImport: () => onCancelSharedImport(),
      },
    },
  });
  return rpc;
}
