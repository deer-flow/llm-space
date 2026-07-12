import path from "node:path";

import { getLlmSpaceHomePath } from "@llm-space/core/server";
import Electrobun, {
  app,
  type BrowserWindow,
  type ElectrobunEvent,
} from "electrobun/bun";

import type { Command } from "../../shared/commands";
import { Analytics } from "../analytics";
import { executeCommandInBun } from "../commands";
import { DesktopHost } from "../host/desktop-host";
import { McpManager } from "../mcp";
import { ModelManager } from "../models";
import { createMainWindowRPC, type MainWindowRPC } from "../rpc";
import { SearchSettingsManager } from "../search";
import { SkillsManager } from "../skills";
import { createLocalFileSystem } from "../storage";
import { StreamThreadController } from "../streaming";
import { createBuiltInToolsModule } from "../tools/built-in";
import { TraceManager } from "../traces";
import { UpdaterService } from "../updates";

import { createShutdownCoordinator } from "./shutdown-coordinator";
import { createMainWindow } from "./window";

export interface DesktopAppRuntime {
  stop(): Promise<void>;
}

/** Build and start the production Bun object graph. */
export async function startDesktopApp(): Promise<DesktopAppRuntime> {
  const homePath = getLlmSpaceHomePath();
  const workspacePath = path.join(homePath, "workspace");
  const analytics = new Analytics();
  const mcpManager = new McpManager();
  const modelManager = new ModelManager();
  const searchSettings = new SearchSettingsManager();
  const skillsManager = new SkillsManager();
  const localFs = createLocalFileSystem(homePath);
  const traceManager = new TraceManager();
  const streaming = new StreamThreadController(modelManager, analytics);
  const host = new DesktopHost({
    modules: [
      createBuiltInToolsModule({
        env: process.env,
        findSkill: skillsManager.findSkill.bind(skillsManager),
        getSearchSettings: searchSettings.get.bind(searchSettings),
        workspaceRoot: workspacePath,
      }),
    ],
  });
  await host.start();

  let mainWindow: BrowserWindow | null = null;
  let rpc: MainWindowRPC | null = null;
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
    sendToWebview: (command: Command) => getRpc().send.executeCommand(command),
    updater,
    workspacePath,
  };
  const executeCommand = (command: Command, window: BrowserWindow): void =>
    executeCommandInBun(command, window, commandDependencies);

  let stopPromise: Promise<void> | null = null;
  const runtime: DesktopAppRuntime = {
    stop() {
      stopPromise ??= _stopDesktopApp([
        ["updater", () => updater.stop()],
        ["streaming", () => streaming.shutdown()],
        ["desktop host", () => host.stop()],
        ["MCP manager", () => mcpManager.shutdown()],
        ["analytics", () => analytics.shutdown()],
      ]);
      return stopPromise;
    },
  };

  try {
    rpc = createMainWindowRPC({
      analytics,
      executeCommand: (command) => executeCommand(command, getMainWindow()),
      getMainWindow,
      homePath,
      localFs,
      mcpManager,
      modelManager,
      searchSettings,
      skillsManager,
      streaming,
      tools: host.tools,
      traceManager,
      updater,
    });
    mainWindow = await createMainWindow({ rpc, executeCommand });

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
