import { mkdirSync } from "node:fs";
import path from "node:path";

import { getLlmSpaceHomePath } from "@llm-space/core/server";
import { writeClipboardFilePaths } from "clip-filepaths";
import { Utils, type BrowserWindow } from "electrobun/bun";

import { COMMAND_META, type Command } from "../shared/commands";

import { saveZoom } from "./app/window-state";
import {
  importFilesWithNativePicker,
  importTextFromClipboard,
} from "./import-files";
import { mainWindowRPC } from "./rpc";

/** The documentation website opened by the `openDocument` command. */
const DOCS_URL = "https://my.feishu.cn/wiki/QnGGwGkoti8nwok2cEOc2oMvnrd";

/** The GitHub issues page opened by the `reportBugs` command. */
const ISSUES_URL = "https://github.com/deer-flow/llm-space/issues";

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 3.0;
const clampZoom = (zoom: number) =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));

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
      // `path` is ignored for now — always open the docs home.
      Utils.openExternal(DOCS_URL);
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
    default:
      return;
  }
}
