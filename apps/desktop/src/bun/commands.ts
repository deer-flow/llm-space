import { mkdirSync } from "node:fs";

import { writeClipboardFilePaths } from "clip-filepaths";
import { Utils, type BrowserWindow } from "electrobun/bun";

import { COMMAND_META, type Command } from "../shared/commands";

import { isChineseLocale } from "./app/locales";
import { saveZoom } from "./app/window-state";
import {
  importFilesWithNativePicker,
  importTextFromClipboard,
} from "./import-files";
import type { UpdaterService } from "./updates";

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

export interface BunCommandDependencies {
  sendToWebview: (command: Command) => void;
  updater: Pick<UpdaterService, "applyUpdateAndRestart" | "checkForUpdates">;
  workspacePath: string;
}

/**
 * Run a {@link Command} from the main process. `webview`-target commands are
 * forwarded to the renderer over RPC; `bun`-target commands (window zoom /
 * reload) run here against `window`.
 */
export function executeCommandInBun(
  command: Command,
  window: BrowserWindow,
  dependencies: BunCommandDependencies
) {
  if (command.type === "importFiles") {
    void importFilesWithNativePicker(
      dependencies.sendToWebview,
      command.args.parent
    );
    return;
  }
  if (command.type === "importFromClipboard") {
    importTextFromClipboard(dependencies.sendToWebview, command.args.parent);
    return;
  }

  if (COMMAND_META[command.type].target === "webview") {
    dependencies.sendToWebview(command);
    return;
  }
  switch (command.type) {
    case "zoomIn": {
      const zoom = clampZoom(window.getPageZoom() + ZOOM_STEP);
      window.setPageZoom(zoom);
      saveZoom(zoom);
      return;
    }
    case "zoomOut": {
      const zoom = clampZoom(window.getPageZoom() - ZOOM_STEP);
      window.setPageZoom(zoom);
      saveZoom(zoom);
      return;
    }
    case "resetZoom": {
      window.setPageZoom(1);
      saveZoom(1);
      return;
    }
    case "reload": {
      window.webview?.executeJavascript("location.reload()");
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
      mkdirSync(dependencies.workspacePath, { recursive: true });
      Utils.openPath(dependencies.workspacePath);
      return;
    }
    case "checkForUpdates": {
      void dependencies.updater.checkForUpdates(true);
      return;
    }
    case "applyUpdateAndRestart": {
      void dependencies.updater.applyUpdateAndRestart();
      return;
    }
    default:
      return;
  }
}
