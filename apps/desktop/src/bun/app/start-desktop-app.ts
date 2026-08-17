import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getLlmSpaceHomePath } from "@llm-space/core/server";
import { GistThreadReader, GistThreadWriter } from "@llm-space/core/storage";
import { PluginManager } from "@llm-space/runtime/plugins";
import Electrobun, {
  app,
  type BrowserWindow,
  type ElectrobunEvent,
  Utils,
  PATHS,
} from "electrobun/bun";

import packageJson from "../../../package.json";
import type { Command } from "../../shared/commands";
import { resolveDeepLinkScheme } from "../../shared/deep-link-scheme";
import { Analytics } from "../analytics";
import { GitHubAuthManager } from "../auth";
import { executeCommandInBun } from "../commands";
import { createDeepLinkHandler, type DeepLinkHandler } from "../deep-link";
import { activateWindowForDeepLink } from "../deep-link/activate-window";
import { setDeepLinkHandler } from "../deep-link/launch";
import { moveToTrash, openPath, revealInFileManager } from "../fs";
import { DesktopHost } from "../host/desktop-host";
import { LocalStorageManager } from "../local-storage";
import { McpManager } from "../mcp";
import { createConfiguredArkImageGenerator, ModelManager } from "../models";
import { NetworkSettingsManager } from "../network";
import {
  PluginCommandExecutionController,
  type PluginCommandReportInput,
} from "../plugins/plugin-command-execution-controller";
import {
  RemoteServerManager,
  registerConfiguredRemoteRuntime,
} from "../remote";
import { createMainWindowRPC, type MainWindowRPC } from "../rpc";
import { LocalRuntimeClient, RuntimeRouter } from "../runtime";
import { SearchSettingsManager } from "../search";
import { getManagedSkillsDir, SkillsManager } from "../skills";
import { createLocalFileSystem } from "../storage";
import { StreamThreadController } from "../streaming";
import { createBuiltInToolsModule } from "../tools/built-in";
import { TraceManager } from "../traces";
import { UpdaterService } from "../updates";

import { createShutdownCoordinator } from "./shutdown-coordinator";
import { createMainWindow } from "./window";
import { flushWindowState } from "./window-state";

export interface DesktopAppRuntime {
  stop(): Promise<void>;
}

/** Build and start the production Bun object graph. */
export async function startDesktopApp(): Promise<DesktopAppRuntime> {
  const homePath = getLlmSpaceHomePath();
  const workspacePath = path.join(homePath, "workspace");
  const analytics = new Analytics();
  const localStorageManager = new LocalStorageManager();
  // Apply the configured proxy to `process.env` before anything spawns a
  // subprocess (MCP) or makes a request, so egress is routed from the start.
  const networkSettings = new NetworkSettingsManager();
  const mcpManager = new McpManager();
  const modelManager = new ModelManager();
  const generateImage = createConfiguredArkImageGenerator({
    modelManager,
    env: process.env,
  });
  const searchSettings = new SearchSettingsManager();
  const skillsManager = new SkillsManager({
    managedSkillsDir: getManagedSkillsDir(),
  });
  let mainWindow: BrowserWindow | null = null;
  let rpc: MainWindowRPC | null = null;
  let deepLink: DeepLinkHandler | null = null;
  let rendererAcceptsDeepLinks = false;
  let deepLinkHandlerInstalled = false;
  const deepLinkScheme = resolveDeepLinkScheme(
    process.env.LLM_SPACE_DEEP_LINK_SCHEME
  );
  const getRpc = (): MainWindowRPC => {
    if (!rpc) throw new Error("Main window RPC is not ready.");
    return rpc;
  };
  const getMainWindow = (): BrowserWindow => {
    if (!mainWindow) throw new Error("Main window is not ready.");
    return mainWindow;
  };
  const installDeepLinkHandler = (): void => {
    if (
      deepLinkHandlerInstalled ||
      !rendererAcceptsDeepLinks ||
      !mainWindow ||
      !deepLink
    ) {
      return;
    }
    deepLinkHandlerInstalled = true;
    setDeepLinkHandler((url) => {
      activateWindowForDeepLink(getMainWindow(), url, deepLinkScheme);
      void deepLink?.handle(url);
    });
  };
  const githubAuth = new GitHubAuthManager({
    onChange: (state) => getRpc().send.githubAuthChanged(state),
  });
  const localFs = createLocalFileSystem(homePath);
  // Reclaim run history whose thread is gone for good. Best-effort and off the
  // startup path: a slow or failing sweep must never delay the window.
  void localFs
    .maintainRunHistory()
    .catch((error: unknown) =>
      console.warn("Run history maintenance failed:", error)
    );
  // Write-side gist connector for the "Share thread" flow. Reuses the signed-in
  // GitHub token (the `gist` scope); creates secret gists readable by URL.
  const gistWriter = new GistThreadWriter({
    getToken: () => githubAuth.getAccessToken(),
  });
  const gistReader = new GistThreadReader({
    getToken: () => githubAuth.getAccessToken(),
  });
  const packagedRunnerPath = path.join(
    PATHS.RESOURCES_FOLDER,
    "app",
    "plugin-runner.ts"
  );
  const sourceRunnerPath = path.resolve(
    import.meta.dir,
    "../../../../../packages/runtime/src/plugins/plugin-runner.ts"
  );
  let executePluginHostCommand = (type: string): Promise<unknown> =>
    Promise.reject(new Error(`Command execution is not ready: ${type}`));
  let reportPluginCommand = (
    input: PluginCommandReportInput
  ): Promise<unknown> =>
    Promise.reject(
      new Error(`Command reporting is not ready: ${input.commandId}`)
    );
  const pluginManager = await PluginManager.create({
    homePath,
    appVersion: packageJson.version,
    runnerPath: existsSync(packagedRunnerPath)
      ? packagedRunnerPath
      : sourceRunnerPath,
    skillsManager,
    mcpManager,
    modelManager,
    onChanged: () => rpc?.send.pluginsChanged({}),
    handleHostRequest: async (method, rawParams) => {
      const params = (rawParams ?? {}) as Record<string, unknown>;
      if (method === "notify") {
        Utils.showNotification({
          title: "LLM Space",
          body: _stringParam(params, "message"),
        });
        return null;
      }
      if (method === "openLink") {
        Utils.openExternal(_stringParam(params, "url"));
        return null;
      }
      if (method === "pickFile") {
        const selected = await Utils.openFileDialog({
          startingFolder: "~/",
          canChooseFiles: true,
          canChooseDirectory: false,
          allowsMultipleSelection: false,
        });
        return selected[0] ?? null;
      }
      if (method === "readWorkspaceFile") {
        return readFile(localFs.realpath(_stringParam(params, "path")), "utf8");
      }
      if (method === "writeWorkspaceFile") {
        const filePath = localFs.realpath(_stringParam(params, "path"));
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, _stringParam(params, "content"), "utf8");
        return null;
      }
      if (method === "executeHostCommand") {
        return executePluginHostCommand(_stringParam(params, "type"));
      }
      if (method === "report") {
        return reportPluginCommand({
          executionId: _stringParam(params, "executionId"),
          commandId: _stringParam(params, "commandId"),
          report: _commandReportParam(params),
        });
      }
      throw new Error(`Unsupported plugin host operation: ${method}`);
    },
  });
  const pluginCommandExecutions = new PluginCommandExecutionController({
    execute: (commandId, context, args, executionId) =>
      pluginManager.commands.executeWithContext(
        commandId,
        context,
        args,
        executionId
      ),
    send: (event) => getRpc().send.pluginCommandExecutionChanged(event),
  });
  reportPluginCommand = (input) => {
    pluginCommandExecutions.report(input);
    return Promise.resolve(null);
  };
  pluginManager.threadStorages.registerBuiltin({
    id: "builtin:github-gist",
    displayName: "GitHub Gist",
    description: "Read and write a thread using GitHub Gist.",
    reader: gistReader,
    writer: gistWriter,
  });
  const traceManager = new TraceManager({ homePath });
  const streaming = new StreamThreadController(modelManager, analytics);
  const host = new DesktopHost({
    modules: [
      createBuiltInToolsModule({
        env: process.env,
        findSkill: skillsManager.findSkill.bind(skillsManager),
        generateImage,
        getSearchSettings: searchSettings.get.bind(searchSettings),
        workspaceRoot: workspacePath,
        openPath,
        revealPath: revealInFileManager,
      }),
    ],
  });
  await host.start();
  const localRuntime = new LocalRuntimeClient({
    localFs,
    mcpManager,
    modelManager,
    networkSettings,
    searchSettings,
    skillsManager,
    streaming,
    tools: host.tools,
    traceManager,
    rmPath: async (workspacePath) => {
      // Run history is stored outside the workspace and deliberately stays
      // behind, so a thread restored from the trash keeps its runs.
      const target = localFs.realpath(workspacePath);
      if (target === localFs.realpath("")) {
        throw new Error("Cannot delete the workspace root.");
      }
      await moveToTrash(target);
    },
  });
  const runtimeRouter = new RuntimeRouter(localRuntime);
  const remoteServerManager = new RemoteServerManager(runtimeRouter);
  const remoteRuntime = await registerConfiguredRemoteRuntime({
    env: process.env,
    runtimeRouter,
  });

  const updater = new UpdaterService((message) =>
    getRpc().send.updateStatusChanged(message)
  );
  const commandDependencies = {
    openExternal: Utils.openExternal,
    sendToWebview: (command: Command) => getRpc().send.executeCommand(command),
    updater,
    workspacePath,
    githubAuth,
  };
  const executeCommand = (command: Command, window: BrowserWindow): void =>
    executeCommandInBun(command, window, commandDependencies);
  executePluginHostCommand = (type) => {
    if (type !== "openSettings" && type !== "refreshTree") {
      throw new Error(`Plugin host command is not allowed: ${type}`);
    }
    executeCommand({ type, args: {} }, getMainWindow());
    return Promise.resolve(null);
  };

  let stopPromise: Promise<void> | null = null;
  const runtime: DesktopAppRuntime = {
    stop() {
      stopPromise ??= _stopDesktopApp([
        ["window state", () => flushWindowState()],
        ["updater", () => updater.stop()],
        ["remote runtime", () => remoteRuntime?.stop()],
        ["remote servers", () => remoteServerManager.shutdown()],
        ["streaming", () => streaming.shutdown()],
        ["desktop host", () => host.stop()],
        ["MCP manager", () => mcpManager.shutdown()],
        ["plugin manager", () => pluginManager.shutdown()],
        ["GitHub auth", () => githubAuth.cancelSignIn()],
        ["analytics", () => analytics.shutdown()],
      ]);
      return stopPromise;
    },
  };

  try {
    rpc = createMainWindowRPC({
      analytics,
      executeCommand: (command) => executeCommand(command, getMainWindow()),
      onCancelSharedImport: () => deepLink?.cancel(),
      onDeepLinkReady: () => {
        rendererAcceptsDeepLinks = true;
        installDeepLinkHandler();
      },
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
    });
    remoteServerManager.setStatusListener((payload) =>
      getRpc().send.remoteServerStatusChanged(payload)
    );
    mainWindow = await createMainWindow({
      rpc,
      executeCommand,
      localStorageValues: localStorageManager.snapshot().values,
    });

    // The window + rpc are ready — wire the importer and flush any deep links
    // buffered at process entry during a cold-start launch (see deep-link/launch).
    deepLink = createDeepLinkHandler({
      localFs,
      githubAuth,
      threadStorages: pluginManager.threadStorages,
      getRpc,
    });
    installDeepLinkHandler();

    analytics.capture("app_opened", { isFirstOpen: analytics.isFirstRun });
    void updater.start();

    const handleBeforeQuit = createShutdownCoordinator({
      quit: () => app.quit(),
      stop: () => runtime.stop(),
    });
    Electrobun.events.on(
      "before-quit",
      (event: ElectrobunEvent<{}, { allow: boolean }>) =>
        handleBeforeQuit(event)
    );

    return runtime;
  } catch (error) {
    await runtime.stop();
    throw error;
  }
}

function _stringParam(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== "string") {
    throw new Error(`Plugin host parameter must be a string: ${key}`);
  }
  return value;
}

function _commandReportParam(
  params: Record<string, unknown>
): PluginCommandReportInput["report"] {
  const report = params.report;
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("Plugin Command report must be an object.");
  }
  return report as PluginCommandReportInput["report"];
}

async function _stopDesktopApp(
  cleanups: readonly [name: string, cleanup: () => Promise<void> | void][]
): Promise<void> {
  for (const [name, cleanup] of cleanups) {
    try {
      await cleanup();
    } catch (error) {
      console.error(`Failed to stop ${name}:`, error);
    }
  }
}
