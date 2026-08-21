import { MESSAGES, type Messages } from "@llm-space/ui/lib/i18n/messages";
import {
  ApplicationMenu,
  type ApplicationMenuItemConfig,
  type BrowserWindow,
} from "electrobun/bun";

import type { Command } from "../../shared/commands";

import { isChineseLocale } from "./locales";

/**
 * The update item in the app submenu: normally "Check for Updates…"; once an
 * update is downloaded it becomes "Restart to Update" (VS Code pattern).
 * `setUpdateReadyInMenu` rebuilds the whole menu — `setApplicationMenu` is
 * idempotent and can be re-called anytime.
 */
function _updateItem(
  updateReady: boolean,
  t: Messages
): ApplicationMenuItemConfig {
  return updateReady
    ? { label: t.menu.app.restartToUpdate, action: "restartToUpdate" }
    : { label: t.menu.app.checkUpdates, action: "checkForUpdates" };
}

/** The app (first) submenu — macOS only (the menu bar leads with the app name). */
function _appSubmenu(
  updateReady: boolean,
  t: Messages
): ApplicationMenuItemConfig {
  return {
    submenu: [
      { label: t.menu.app.about, role: "about" },
      _updateItem(updateReady, t),
      { type: "divider" },
      {
        label: t.menu.app.settings,
        action: "settings",
        accelerator: "CommandOrControl+,",
      },
      { type: "divider" },
      { role: "hide", accelerator: "CommandOrControl+H" },
      { role: "hideOthers", accelerator: "CommandOrControl+Shift+H" },
      { role: "showAll" },
      { type: "divider" },
      {
        label: t.menu.app.quit,
        role: "quit",
        accelerator: "CommandOrControl+Q",
      },
    ],
  };
}

function _fileSubmenu(t: Messages): ApplicationMenuItemConfig[] {
  return [
    {
      label: t.menu.file.newFile,
      action: "newThread",
      accelerator: "CommandOrControl+N",
    },
    { label: t.menu.file.newFromExamples, action: "newFromExamples" },
    { type: "divider" },
    {
      label: t.menu.file.newFolder,
      action: "newFolder",
      accelerator: "CommandOrControl+Shift+N",
    },
    { type: "divider" },
    { label: t.menu.file.importFiles, action: "importFiles" },
    { label: t.menu.file.importClipboard, action: "importFromClipboard" },
    { type: "divider" },
    { label: t.menu.file.share, action: "shareThread" },
    { type: "divider" },
    { label: t.menu.file.refreshWorkspace, action: "refreshTree" },
    { label: t.menu.file.revealWorkspace, action: "revealWorkspaceFolder" },
    { type: "divider" },
    {
      label: t.menu.file.closeTab,
      action: "closeTab",
      accelerator: "CommandOrControl+W",
    },
    { label: t.menu.file.closeOthers, action: "closeOtherTabs" },
    { label: t.menu.file.closeAll, action: "closeAllTabs" },
    { type: "divider" },
    {
      label: t.menu.file.reopenClosed,
      action: "reopenClosedTabs",
      accelerator: "CommandOrControl+Shift+T",
    },
  ];
}

function _editSubmenu(): ApplicationMenuItemConfig[] {
  return [
    { role: "undo" },
    { role: "redo" },
    { type: "divider" },
    { role: "cut" },
    { role: "copy" },
    { role: "paste" },
    { role: "pasteAndMatchStyle" },
    { role: "delete" },
    { role: "selectAll" },
  ];
}

function _viewSubmenu(t: Messages): ApplicationMenuItemConfig[] {
  return [
    {
      label: t.menu.view.commandPalette,
      action: "commandPalette",
      accelerator: "CommandOrControl+Shift+P",
    },
    { type: "divider" },
    {
      label: t.menu.view.toggleSidebar,
      action: "toggleSidebar",
      accelerator: "CommandOrControl+B",
    },
    { type: "divider" },
    {
      label: t.menu.view.reload,
      action: "reload",
      accelerator: "CommandOrControl+Shift+R",
    },
    { type: "divider" },
    {
      label: t.menu.view.zoomIn,
      action: "zoomIn",
      accelerator: "CommandOrControl+Plus",
    },
    {
      label: t.menu.view.zoomOut,
      action: "zoomOut",
      accelerator: "CommandOrControl+-",
    },
    {
      label: t.menu.view.resetZoom,
      action: "resetZoom",
      accelerator: "CommandOrControl+0",
    },
  ];
}

function _windowSubmenu(t: Messages): ApplicationMenuItemConfig[] {
  return [
    { role: "minimize" },
    { role: "bringAllToFront" },
    { type: "divider" },
    {
      label: t.menu.window.selectPrevious,
      action: "selectPreviousTab",
      accelerator: "CommandOrControl+Option+Left",
    },
    {
      label: t.menu.window.selectNext,
      action: "selectNextTab",
      accelerator: "CommandOrControl+Option+Right",
    },
    { type: "divider" },
    { role: "toggleFullScreen", accelerator: "CommandOrControl+Shift+F" },
  ];
}

function _helpSubmenu(t: Messages): ApplicationMenuItemConfig[] {
  return [
    { label: t.menu.help.viewDocs, action: "openDocument" },
    { type: "divider" },
    { label: t.menu.help.officialSite, action: "openOfficialWebsite" },
    { label: t.menu.help.github, action: "openGitHubProject" },
    { label: t.menu.help.harness101, action: "openHarness101" },
    { type: "divider" },
    { label: t.menu.help.reportBug, action: "reportBugs" },
    { label: t.menu.help.donate, action: "donate" },
    { type: "divider" },
    { label: t.menu.help.onboard, action: "onboard" },
  ];
}

/**
 * The native application menu is a macOS convention: the menu bar leads with
 * the app submenu. Windows (and Linux, when it ships) deliberately have no
 * native menu — the in-app UI owns the commands.
 */
function _buildMenu(
  updateReady: boolean,
  t: Messages
): ApplicationMenuItemConfig[] {
  return [
    _appSubmenu(updateReady, t),
    { label: t.menu.file.label, submenu: _fileSubmenu(t) },
    { label: t.menu.edit.label, submenu: _editSubmenu() },
    { label: t.menu.view.label, submenu: _viewSubmenu(t) },
    { label: t.menu.window.label, role: "window", submenu: _windowSubmenu(t) },
    { label: t.menu.help.label, submenu: _helpSubmenu(t) },
  ];
}

/**
 * Flip the app menu's update item between "Check for Updates…" and
 * "Restart to Update". Called by the updater service when a download becomes
 * ready. `null` restores the default item.
 */
export function setUpdateReadyInMenu(version: string | null) {
  _menuUpdateReady = version !== null;
  _rebuildMenu();
}

let _menuLang: "en" | "zh" = isChineseLocale() ? "zh" : "en";
let _menuUpdateReady = false;

function _rebuildMenu() {
  if (process.platform !== "darwin") return;
  ApplicationMenu.setApplicationMenu(_buildMenu(_menuUpdateReady, MESSAGES[_menuLang]));
}

/** Rebuild the native menu after a UI-language change (macOS only). */
export function setMenuLanguage(lang: "en" | "zh") {
  if (_menuLang === lang) return;
  _menuLang = lang;
  _rebuildMenu();
}

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
  newFromExamples: { type: "openStartFromExample", args: { parent: "" } },
  newFolder: { type: "newFolder", args: {} },
  importFiles: { type: "importFiles", args: {} },
  importFromClipboard: { type: "importFromClipboard", args: {} },
  shareThread: { type: "shareThread", args: {} },
  refreshTree: { type: "refreshTree", args: {} },
  revealWorkspaceFolder: { type: "openWorkspaceFolder", args: {} },
  closeTab: { type: "closeTab", args: {} },
  closeOtherTabs: { type: "closeOtherTabs", args: {} },
  closeAllTabs: { type: "closeAllTabs", args: {} },
  reopenClosedTabs: { type: "reopenClosedTab", args: {} },
  selectNextTab: { type: "selectNextTab", args: {} },
  selectPreviousTab: { type: "selectPreviousTab", args: {} },
  openDocument: { type: "openDocument", args: {} },
  openGitHubProject: {
    type: "openLink",
    args: { url: "https://github.com/deer-flow/llm-space/tree/main" },
  },
  openOfficialWebsite: {
    type: "openLink",
    args: { url: "https://deer-flow.github.io/llm-space/" },
  },
  reportBugs: { type: "reportBugs", args: {} },
  checkForUpdates: { type: "checkForUpdates", args: {} },
  restartToUpdate: { type: "applyUpdateAndRestart", args: {} },
  donate: {
    type: "openLink",
    args: { url: "https://my.feishu.cn/wiki/OvLBwVuSkiCR1ik5wGEcBXZfnye" },
  },
  onboard: { type: "openOnboard", args: {} },
  openHarness101: {
    type: "openLink",
    args: {
      url: isChineseLocale()
        ? "https://my.feishu.cn/wiki/L082wubkdie8uMkRUjgceKYQnIe?fromScene=spaceOverview"
        : "https://my.feishu.cn/docx/G8CGdg2PQoGjsRxspKAc9XZYnKT",
    },
  },
};

/**
 * Install the application menu and wire its actions to the main window. Called
 * once after the window exists. macOS only — Windows/Linux have no native menu.
 */
export function registerMenuActions(
  window: BrowserWindow,
  executeCommand: (command: Command, window: BrowserWindow) => void
) {
  if (process.platform !== "darwin") return;
  ApplicationMenu.setApplicationMenu(_buildMenu(_menuUpdateReady, MESSAGES[_menuLang]));
  ApplicationMenu.on("application-menu-clicked", (event) => {
    const { action } = (event as { data: { action: string } }).data;
    const command = MENU_ACTION_COMMANDS[action];
    if (command) executeCommand(command, window);
  });
}
