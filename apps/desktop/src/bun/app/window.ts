import {
  DEFAULT_WINDOW_FRAME,
  getWindowFrame,
  getWindowMaximized,
  getWindowScaleFactor,
  getWindowZoom,
  loadWindowState,
  resolveInitialWindowFrame,
  type WindowFrame,
  type WindowState,
} from "@llm-space/core/server";
import { BrowserWindow, Screen, Updater } from "electrobun/bun";

import { mainWindowRPC } from "../rpc";

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

/**
 * On win32 the native layer takes frames as raw physical pixels (no DPI
 * compensation on the way to CreateWindowExA), so the DIP default — and any
 * saved frame recorded under a different display scale — must be rescaled to
 * the current display's scale factor and clamped into its work area.
 * Everywhere else frames are DIPs end to end and pass through verbatim.
 */
function initialWindowFrame(state: WindowState): WindowFrame {
  const savedFrame = getWindowFrame(state);
  if (process.platform !== "win32") {
    return savedFrame ?? DEFAULT_WINDOW_FRAME;
  }
  const display = Screen.getPrimaryDisplay();
  return resolveInitialWindowFrame({
    savedFrame,
    savedScaleFactor: getWindowScaleFactor(state),
    currentScaleFactor: display.scaleFactor,
    workArea: display.workArea,
  });
}

const url = await getMainViewUrl();
const windowState = await loadWindowState();
const initialFrame = initialWindowFrame(windowState);
const savedZoom = getWindowZoom(windowState) ?? 1;

export const mainWindow = new BrowserWindow({
  title: "LLM Space",
  url,
  // On macOS this shows the traffic lights overlaid on our content; on Windows
  // it yields a frameless window (with resize borders + DWM shadow + Aero
  // Snap) whose caption buttons we draw ourselves (`components/window-controls`).
  titleBarStyle: "hiddenInset",
  rpc: mainWindowRPC,
  // macOS-only: position the traffic lights. Ignored on Windows/Linux, but
  // don't even pass it there to keep the options honest per-platform.
  ...(process.platform === "darwin"
    ? { trafficLightOffset: { x: 2, y: 16 } }
    : {}),
  frame: initialFrame,
});

attachWindowStates(mainWindow, {
  isMaximized: getWindowMaximized(windowState),
  zoom: savedZoom,
  onFullScreenChange: (fullScreen) => {
    mainWindowRPC.send.fullScreenChanged({ fullScreen });
  },
});
registerMenuActions(mainWindow);
