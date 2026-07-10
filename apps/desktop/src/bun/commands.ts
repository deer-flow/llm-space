import { mkdirSync } from "node:fs";
import path from "node:path";

import { getLlmSpaceHomePath } from "@llm-space/core/server";
import { writeClipboardFilePaths } from "clip-filepaths";
import { Utils, type BrowserWindow } from "electrobun/bun";

import { COMMAND_META, type Command } from "../shared/commands";

import { isChineseLocale } from "./app/locales";
import { getDesiredZoom, saveZoom } from "./app/window-state";
import {
  importFilesWithNativePicker,
  importTextFromClipboard,
} from "./import-files";
import { mainWindowRPC } from "./rpc";
import { applyUpdateAndRestart, checkForUpdates } from "./updates";

/** The documentation website opened by the `openDocument` command. */
const DOCS_URL =
  "https://github.com/deer-flow/llm-space/blob/main/docs/index.md";

/** The Chinese documentation opened when the OS locale is Chinese. */
const DOCS_ZH_CN_URL = "https://my.feishu.cn/wiki/QnGGwGkoti8nwok2cEOc2oMvnrd";

/** The GitHub issues page opened by the `reportBugs` command. */
const ISSUES_URL = "https://github.com/deer-flow/llm-space/issues";

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 3.0;
const clampZoom = (zoom: number) =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));

const IS_WINDOWS = process.platform === "win32";

/**
 * Electrobun's native page zoom is a no-op on Windows, so zoom there is
 * tracked bun-side (`getDesiredZoom`) and applied by the renderer as CSS zoom
 * (the `applyPageZoom` message → `lib/use-css-zoom.ts`).
 */
function _currentZoom(window: BrowserWindow): number {
  return IS_WINDOWS ? getDesiredZoom() : window.getPageZoom();
}

function _applyZoom(window: BrowserWindow, zoom: number) {
  if (IS_WINDOWS) {
    mainWindowRPC.send.applyPageZoom({ zoom });
  } else {
    window.setPageZoom(zoom);
  }
  saveZoom(zoom);
}

/**
 * Run a {@link Command} from the main process. `webview`-target commands are
 * forwarded to the renderer over RPC; `bun`-target commands (window zoom /
 * reload) run here against `window`.
 */
export function executeCommandInBun(command: Command, window: BrowserWindow) {
  if (command.type === "importFiles") {
    void importFilesWithNativePicker(command.args.parent);
    return;
  }
  if (command.type === "importFromClipboard") {
    importTextFromClipboard(command.args.parent);
    return;
  }

  if (COMMAND_META[command.type].target === "webview") {
    mainWindowRPC.send.executeCommand(command);
    return;
  }
  switch (command.type) {
    case "zoomIn": {
      _applyZoom(window, clampZoom(_currentZoom(window) + ZOOM_STEP));
      return;
    }
    case "zoomOut": {
      _applyZoom(window, clampZoom(_currentZoom(window) - ZOOM_STEP));
      return;
    }
    case "resetZoom": {
      _applyZoom(window, 1);
      return;
    }
    case "reload": {
      window.webview?.executeJavascript("location.reload()");
      return;
    }
    case "windowMinimize": {
      window.minimize();
      return;
    }
    case "windowToggleMaximize": {
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
      return;
    }
    case "windowClose": {
      window.close();
      return;
    }
    case "toggleFullScreen": {
      window.setFullScreen(!window.isFullScreen());
      return;
    }
    case "openLink": {
      Utils.openExternal(command.args.url);
      return;
    }
    case "openDocument": {
      // `path` is ignored for now — always open the docs home, picking the
      // Chinese docs for Chinese locales and the English wiki otherwise.
      Utils.openExternal(isChineseLocale() ? DOCS_ZH_CN_URL : DOCS_URL);
      return;
    }
    case "reportBugs": {
      Utils.openExternal(ISSUES_URL);
      return;
    }
    case "copyFile": {
      // Put the file on the OS clipboard as a file reference so it can be pasted
      // into Finder/Explorer or other apps. `path` is absolute.
      try {
        writeClipboardFilePaths([command.args.path]);
      } catch (err) {
        console.error("Failed to copy to clipboard:", err);
      }
      return;
    }
    case "openWorkspaceFolder": {
      const workspacePath = path.join(getLlmSpaceHomePath(), "workspace");
      mkdirSync(workspacePath, { recursive: true });
      Utils.openPath(workspacePath);
      return;
    }
    case "checkForUpdates": {
      void checkForUpdates(true);
      return;
    }
    case "applyUpdateAndRestart": {
      void applyUpdateAndRestart();
      return;
    }
    default:
      return;
  }
}
