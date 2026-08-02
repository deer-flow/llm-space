import path from "node:path";

import { getLlmSpaceHomePath } from "@llm-space/core/server";
import { GistThreadWriter } from "@llm-space/core/storage";
import Electrobun, {
  app,
  type BrowserWindow,
  type ElectrobunEvent,
  Utils,
} from "electrobun/bun";

import type { Command } from "../../shared/commands";
import { Analytics } from "../analytics";
import { GitHubAuthManager } from "../auth";
import { executeCommandInBun } from "../commands";
import { createDeepLinkHandler, type DeepLinkHandler } from "../deep-link";
import { setDeepLinkHandler } from "../deep-link/launch";
import { moveToTrash, openPath, revealInFileManager } from "../fs";
import { DesktopHost } from "../host/desktop-host";
import { McpManager } from "../mcp";
import { createArkImageGenerator, ModelManager } from "../models";
import { NetworkSettingsManager } from "../network";
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
  // Apply the configured proxy to `process.env` before anything spawns a
  // subprocess (MCP) or makes a request, so egress is routed from the start.
  const networkSettings = new NetworkSettingsManager();
  const mcpManager = new McpManager();
  const modelManager = new ModelManager();
  const generateImage = createArkImageGenerator({
    getConfig: () => modelManager.getArkImageGenerationConfig(),
    getApiKey: async () => {
      // An explicitly configured `$ENV_NAME` remains authoritative even when
      // unset; only a truly blank setting falls back to Ark's official env key.
      const configured = await modelManager.getApiKey("ark", false);
      return configured === undefined
        ? process.env.ARK_API_KEY
        : modelManager.getApiKey("ark");
    },
    getBaseUrl: () => modelManager.getBaseUrl("ark"),
    getHeaders: () => modelManager.getHeaders("ark"),
  });
  const searchSettings = new SearchSettingsManager();
  const skillsManager = new SkillsManager({
    managedSkillsDir: getManagedSkillsDir(),
  });
  const githubAuth = new GitHubAuthManager({
    onChange: (state) => getRpc().send.githubAuthChanged(state),
  });
  const localFs = createLocalFileSystem(homePath);
  // Write-side gist connector for the "Share thread" flow. Reuses the signed-in
  // GitHub token (the `gist` scope); creates secret gists readable by URL.
  const gistWriter = new GistThreadWriter({
    getToken: () => githubAuth.getAccessToken(),
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
      const abs = localFs.realpath(workspacePath);
      if (abs === localFs.realpath("")) {
        throw new Error("Cannot delete the workspace root.");
      }
      await moveToTrash(abs);
    },
  });
  const runtimeRouter = new RuntimeRouter(localRuntime);
  const remoteServerManager = new RemoteServerManager(runtimeRouter);
  const remoteRuntime = await registerConfiguredRemoteRuntime({
    env: process.env,
    runtimeRouter,
  });

  let mainWindow: BrowserWindow | null = null;
  let rpc: MainWindowRPC | null = null;
  let deepLink: DeepLinkHandler | null = null;
  const getRpc = (): MainWindowRPC => {
    if (!rpc) {
      throw new Error("Main window RPC is not ready.");
    }
    return rpc;
  };
  const getMainWindow = (): BrowserWindow => {
    if (!mainWindow) {
      throw new Error("Main window is not ready.");
    }
    return mainWindow;
  };
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
      githubAuth,
      getMainWindow,
      gistWriter,
      homePath,
      localFs,
      runtimeRouter,
      remoteServerManager,
      skillsManager,
      updater,
    });
    remoteServerManager.setStatusListener((payload) =>
      getRpc().send.remoteServerStatusChanged(payload)
    );
    mainWindow = await createMainWindow({ rpc, executeCommand });

    // The window + rpc are ready — wire the importer and flush any deep links
    // buffered at process entry during a cold-start launch (see deep-link/launch).
    deepLink = createDeepLinkHandler({ localFs, githubAuth, getRpc });
    setDeepLinkHandler((url) => void deepLink?.handle(url));

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
