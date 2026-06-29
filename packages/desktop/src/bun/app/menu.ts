import { ApplicationMenu, type BrowserWindow } from "electrobun/bun";

import { mainWindowRPC } from "../rpc";

import { saveZoom } from "./window-state";

ApplicationMenu.setApplicationMenu([
  {
    submenu: [
      { label: "About LLM Space", role: "about" },
      { type: "divider" },
      {
        role: "hide",
        accelerator: "CommandOrControl+H",
      },
      {
        role: "hideOthers",
        accelerator: "CommandOrControl+Shift+H",
      },
      {
        role: "showAll",
      },
      { type: "divider" },
      {
        label: "Quit LLM Space",
        role: "quit",
        accelerator: "CommandOrControl+Q",
      },
    ],
  },
  {
    label: "File",
    submenu: [
      {
        label: "New File",
        action: "newThread",
        accelerator: "CommandOrControl+N",
      },
      {
        type: "separator",
      },
      {
        label: "Close Tab",
        action: "closeTab",
        accelerator: "CommandOrControl+W",
      },
      {
        label: "Close Others",
        action: "closeOtherTabs",
      },
      {
        label: "Close All Tabs",
        action: "closeAllTabs",
      },
    ],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "pasteAndMatchStyle" },
      { role: "delete" },
      { role: "selectAll" },
    ],
  },
  {
    label: "View",
    submenu: [
      {
        label: "Toggle Sidebar",
        action: "toggleSidebar",
        accelerator: "CommandOrControl+B",
      },
      { type: "separator" },
      {
        label: "Reload",
        action: "reload",
        accelerator: "CommandOrControl+Shift+R",
      },
      { type: "separator" },
      {
        label: "Zoom In",
        action: "zoomIn",
        accelerator: "CommandOrControl+Plus",
      },
      {
        label: "Zoom Out",
        action: "zoomOut",
        accelerator: "CommandOrControl+-",
      },
      {
        label: "Reset Zoom",
        action: "resetZoom",
        accelerator: "CommandOrControl+0",
      },
    ],
  },
  {
    label: "Window",
    role: "window",
    submenu: [
      {
        role: "minimize",
      },
      {
        role: "bringAllToFront",
      },
      {
        type: "separator",
      },
      {
        role: "toggleFullScreen",
        accelerator: "CommandOrControl+Shift+F",
      },
    ],
  },
  {
    label: "Help",
    submenu: [
      {
        label: "Report Bug",
      },
      {
        type: "separator",
      },
      {
        label: "View Documentation",
        role: "showHelp",
      },
    ],
  },
]);

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 3.0;
const clampZoom = (zoom: number) =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));

/**
 * Wire View-menu actions to the main window. Called after the window exists
 * (the menu itself is set at import time above).
 */
export function registerMenuActions(window: BrowserWindow) {
  ApplicationMenu.on("application-menu-clicked", (event) => {
    const { action } = (event as { data: { action: string } }).data;
    switch (action) {
      case "reload": {
        window.webview?.executeJavascript("location.reload()");
        return;
      }
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
      case "toggleSidebar": {
        mainWindowRPC.send.toggleSidebar({});
        return;
      }
      case "newThread": {
        mainWindowRPC.send.newThread({});
        return;
      }
      case "closeTab": {
        mainWindowRPC.send.closeActiveTab({});
        return;
      }
      case "closeOtherTabs": {
        mainWindowRPC.send.closeOtherTabs({});
        return;
      }
      case "closeAllTabs": {
        mainWindowRPC.send.closeAllTabs({});
        return;
      }
      default:
        return;
    }
  });
}
