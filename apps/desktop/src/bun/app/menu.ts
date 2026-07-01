import { ApplicationMenu, type BrowserWindow } from "electrobun/bun";

import type { Command } from "../../shared/commands";
import { executeCommandInBun } from "../commands";

ApplicationMenu.setApplicationMenu([
  {
    submenu: [
      { label: "About LLM Space", role: "about" },
      { type: "divider" },
      {
        label: "Settings...",
        action: "settings",
        accelerator: "CommandOrControl+,",
      },
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
        label: "New Folder",
        action: "newFolder",
        accelerator: "CommandOrControl+Shift+N",
      },
      {
        type: "divider",
      },
      {
        label: "Refresh Workspace",
        action: "refreshTree",
      },
      {
        type: "divider",
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
      {
        type: "divider",
      },
      {
        label: "Reopen Closed Tabs",
        action: "reopenClosedTabs",
        accelerator: "CommandOrControl+Shift+T",
      },
    ],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "divider" },
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
        label: "Command Palette...",
        action: "commandPalette",
        accelerator: "CommandOrControl+Shift+P",
      },
      { type: "divider" },
      {
        label: "Toggle Sidebar",
        action: "toggleSidebar",
        accelerator: "CommandOrControl+B",
      },
      { type: "divider" },
      {
        label: "Reload",
        action: "reload",
        accelerator: "CommandOrControl+Shift+R",
      },
      { type: "divider" },
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
        type: "divider",
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
        label: "View Documentation",
        action: "openDocument",
      },
      {
        type: "divider",
      },
      {
        label: "Visit GitHub Project",
        action: "openGitHubProject",
      },
      {
        label: "Report Bug",
        action: "reportBugs",
      },
      {
        label: "Donate",
        action: "donate",
      },
      {
        type: "divider",
      },
      {
        label: "Onboard",
        action: "onboard",
      },
    ],
  },
]);

/**
 * The native menu items carry a string `action`; map each to the {@link Command}
 * it dispatches. Everything then flows through the single `executeCommandInBun`
 * entry point (window-side commands run locally, webview-side ones are
 * forwarded over RPC).
 */
const MENU_ACTION_COMMANDS: Record<string, Command> = {
  reload: { type: "reload", args: {} },
  zoomIn: { type: "zoomIn", args: {} },
  zoomOut: { type: "zoomOut", args: {} },
  resetZoom: { type: "resetZoom", args: {} },
  toggleSidebar: { type: "toggleSidebar", args: {} },
  commandPalette: { type: "openCommandPalette", args: {} },
  settings: { type: "openSettings", args: {} },
  newThread: { type: "newFile", args: {} },
  newFolder: { type: "newFolder", args: {} },
  refreshTree: { type: "refreshTree", args: {} },
  closeTab: { type: "closeTab", args: {} },
  closeOtherTabs: { type: "closeOtherTabs", args: {} },
  closeAllTabs: { type: "closeAllTabs", args: {} },
  reopenClosedTabs: { type: "reopenClosedTab", args: {} },
  openDocument: { type: "openDocument", args: {} },
  openGitHubProject: {
    type: "openLink",
    args: { url: "https://github.com/llm-space/llm-space/tree/main" },
  },
  reportBugs: { type: "reportBugs", args: {} },
  donate: {
    type: "openLink",
    args: { url: "https://my.feishu.cn/wiki/OvLBwVuSkiCR1ik5wGEcBXZfnye" },
  },
  onboard: { type: "openOnboard", args: {} },
};

/**
 * Wire the application-menu actions to the main window. Called after the window
 * exists (the menu itself is set at import time above).
 */
export function registerMenuActions(window: BrowserWindow) {
  ApplicationMenu.on("application-menu-clicked", (event) => {
    const { action } = (event as { data: { action: string } }).data;
    const command = MENU_ACTION_COMMANDS[action];
    if (command) executeCommandInBun(command, window);
  });
}
