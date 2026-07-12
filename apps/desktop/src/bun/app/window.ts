import {
  DEFAULT_WINDOW_FRAME,
  getWindowFrame,
  getWindowMaximized,
  getWindowZoom,
  loadWindowState,
} from "@llm-space/core/server";
import { BrowserWindow, Updater } from "electrobun/bun";

import type { Command } from "../../shared/commands";
import type { MainWindowRPC } from "../rpc";

import { registerMenuActions } from "./menu";
import { attachWindowStates } from "./window-state";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

// Check if Vite dev server is running for HMR
async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      console.info(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    } catch {
      console.info(
        "Vite dev server not running. Run 'bun run dev:hmr' for HMR support."
      );
    }
  }
  return "views://mainview/index.html";
}

export async function createMainWindow({
  rpc,
  executeCommand,
}: {
  rpc: MainWindowRPC;
  executeCommand: (command: Command, window: BrowserWindow) => void;
}): Promise<BrowserWindow> {
  const url = await getMainViewUrl();
  const windowState = await loadWindowState();
  const savedFrame = getWindowFrame(windowState) ?? DEFAULT_WINDOW_FRAME;
  const savedZoom = getWindowZoom(windowState) ?? 1;

  const window = new BrowserWindow({
    title: "LLM Space",
    url,
    titleBarStyle: "hiddenInset",
    rpc,
    trafficLightOffset: {
      x: 2,
      y: 16,
    },
    frame: savedFrame,
  });

  attachWindowStates(window, {
    isMaximized: getWindowMaximized(windowState),
    zoom: savedZoom,
    onFullScreenChange: (fullScreen) => {
      rpc.send.fullScreenChanged({ fullScreen });
    },
  });
  registerMenuActions(window, executeCommand);
  return window;
}
