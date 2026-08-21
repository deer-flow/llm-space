import {
  getWindowFullScreen,
  getWindowMaximized,
  getWindowZoom,
  resolveWindowFrame,
  WindowStateStore,
} from "@llm-space/core/server";
import { BrowserWindow, Updater } from "electrobun/bun";

import type { Command } from "../../shared/commands";
import type { MainWindowRPC } from "../rpc";

import { withAppearancePreferences } from "./main-view-url";
import { registerMenuActions } from "./menu";
import { attachWindowStates } from "./window-state";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

// Check if Vite dev server is running for HMR
async function getMainViewUrl(
  localStorageValues: Record<string, string>
): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      console.info(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
      return withAppearancePreferences(DEV_SERVER_URL, localStorageValues);
    } catch {
      console.info(
        "Vite dev server not running. Run 'bun run dev:hmr' for HMR support."
      );
    }
  }
  return withAppearancePreferences(
    "views://mainview/index.html",
    localStorageValues
  );
}

export async function createMainWindow({
  rpc,
  executeCommand,
  localStorageValues,
}: {
  rpc: MainWindowRPC;
  executeCommand: (command: Command, window: BrowserWindow) => void;
  localStorageValues: Record<string, string>;
}): Promise<BrowserWindow> {
  const url = await getMainViewUrl(localStorageValues);
  const windowStateStore = await WindowStateStore.load();
  const windowState = windowStateStore.state;
  const savedFrame = resolveWindowFrame(windowState);
  const savedZoom = getWindowZoom(windowState) ?? 1;

  const window = new BrowserWindow({
    title: "LLM Space",
    url,
    // macOS draws the traffic lights over the webview and hides the titlebar;
    // Windows has neither, so these options are macOS-only.
    ...(process.platform === "win32"
      ? {}
      : {
          titleBarStyle: "hiddenInset" as const,
          trafficLightOffset: { x: 2, y: 16 },
        }),
    rpc,
    frame: savedFrame,
  });

  attachWindowStates(window, {
    store: windowStateStore,
    isMaximized: getWindowMaximized(windowState),
    isFullScreen: getWindowFullScreen(windowState),
    zoom: savedZoom,
    onFullScreenChange: (fullScreen) => {
      rpc.send.fullScreenChanged({ fullScreen });
    },
  });
  registerMenuActions(window, executeCommand);
  return window;
}
