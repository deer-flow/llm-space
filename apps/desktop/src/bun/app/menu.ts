import {
  ApplicationMenu,
  type ApplicationMenuItemConfig,
  type BrowserWindow,
} from "electrobun/bun";

import { MESSAGES } from "../../i18n/messages";
import { commandLabel } from "../../shared/command-labels";
import type { Command } from "../../shared/commands";
import type { AppLanguage } from "../../shared/language";

import { isChineseLocale } from "./locales";

/**
 * The menu follows the OS display language: it is built once at startup, and
 * an in-app language change (renderer localStorage) cannot reach it until
 * settings are synced to the main process. Role items (Undo, Copy, …) are
 * rendered by the OS and localize themselves.
 */
function _menuLang(): AppLanguage {
  return isChineseLocale() ? "zh" : "en";
}

/**
 * The app (first) submenu. Its update item is the one dynamic piece: normally
 * "Check for Updates…"; once an update is downloaded it becomes
 * "Restart to Update" (VS Code pattern). `setUpdateReadyInMenu` rebuilds the
 * whole menu — `setApplicationMenu` is idempotent and can be re-called anytime.
 */
function _appSubmenu(
  updateReady: boolean,
  lang: AppLanguage
): ApplicationMenuItemConfig {
  const t = MESSAGES[lang];
  const updateItem = updateReady
    ? {
        label: commandLabel("applyUpdateAndRestart", lang),
        action: "restartToUpdate",
      }
    : {
        label: commandLabel("checkForUpdates", lang),
        action: "checkForUpdates",
      };
  return {
    submenu: [
      { label: t.menu.about, role: "about" },
      updateItem,
      { type: "divider" },
      {
        label: t.menu.settings,
        action: "settings",
        accelerator: "CommandOrControl+,",
      },
      { type: "divider" },
      { role: "hide", accelerator: "CommandOrControl+H" },
      { role: "hideOthers", accelerator: "CommandOrControl+Shift+H" },
      { role: "showAll" },
      { type: "divider" },
      {
        label: t.menu.quit,
        role: "quit",
        accelerator: "CommandOrControl+Q",
      },
    ],
  };
}

function _buildMenu(updateReady: boolean): ApplicationMenuItemConfig[] {
  const lang = _menuLang();
  const t = MESSAGES[lang];
  return [
    _appSubmenu(updateReady, lang),
    {
      label: t.menu.file,
      submenu: [
        {
          label: commandLabel("newFile", lang),
          action: "newThread",
          accelerator: "CommandOrControl+N",
        },
        { label: t.menu.newFromExamples, action: "newFromExamples" },
        { type: "divider" },
        {
          label: commandLabel("newFolder", lang),
          action: "newFolder",
          accelerator: "CommandOrControl+Shift+N",
        },
        { type: "divider" },
        { label: commandLabel("importFiles", lang), action: "importFiles" },
        {
          label: commandLabel("importFromClipboard", lang),
          action: "importFromClipboard",
        },
        { type: "divider" },
        { label: t.menu.share, action: "shareThread" },
        { type: "divider" },
        { label: t.menu.refreshWorkspace, action: "refreshTree" },
        {
          label: t.menu.revealWorkspaceFolder,
          action: "revealWorkspaceFolder",
        },
        { type: "divider" },
        {
          label: commandLabel("closeTab", lang),
          action: "closeTab",
          accelerator: "CommandOrControl+W",
        },
        { label: t.menu.closeOthers, action: "closeOtherTabs" },
        {
          label: commandLabel("closeAllTabs", lang),
          action: "closeAllTabs",
        },
        { type: "divider" },
        {
          label: t.menu.reopenClosedTabs,
          action: "reopenClosedTabs",
          accelerator: "CommandOrControl+Shift+T",
        },
      ],
    },
    {
      label: t.menu.edit,
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
      label: t.menu.view,
      submenu: [
        {
          label: t.menu.commandPalette,
          action: "commandPalette",
          accelerator: "CommandOrControl+Shift+P",
        },
        { type: "divider" },
        {
          label: commandLabel("toggleSidebar", lang),
          action: "toggleSidebar",
          accelerator: "CommandOrControl+B",
        },
        { type: "divider" },
        {
          label: commandLabel("reload", lang),
          action: "reload",
          accelerator: "CommandOrControl+Shift+R",
        },
        { type: "divider" },
        {
          label: commandLabel("zoomIn", lang),
          action: "zoomIn",
          accelerator: "CommandOrControl+=",
        },
        {
          label: commandLabel("zoomOut", lang),
          action: "zoomOut",
          accelerator: "CommandOrControl+-",
        },
        {
          label: commandLabel("resetZoom", lang),
          action: "resetZoom",
          accelerator: "CommandOrControl+0",
        },
      ],
    },
    {
      label: t.menu.window,
      role: "window",
      submenu: [
        { role: "minimize" },
        { role: "bringAllToFront" },
        { type: "divider" },
        {
          label: commandLabel("selectPreviousTab", lang),
          action: "selectPreviousTab",
          accelerator: "CommandOrControl+Option+Left",
        },
        {
          label: commandLabel("selectNextTab", lang),
          action: "selectNextTab",
          accelerator: "CommandOrControl+Option+Right",
        },
        { type: "divider" },
        { role: "toggleFullScreen", accelerator: "CommandOrControl+Shift+F" },
      ],
    },
    {
      label: t.menu.help,
      submenu: [
        { label: t.menu.viewDocumentation, action: "openDocument" },
        { type: "divider" },
        { label: t.menu.visitOfficialWebsite, action: "openOfficialWebsite" },
        { label: t.menu.visitGitHubProject, action: "openGitHubProject" },
        { label: t.menu.visitHarness101, action: "openHarness101" },
        { type: "divider" },
        { label: t.menu.reportBug, action: "reportBugs" },
        { label: t.menu.donate, action: "donate" },
        { type: "divider" },
        { label: t.menu.onboard, action: "onboard" },
      ],
    },
  ];
}

/**
 * Flip the app menu's update item between "Check for Updates…" and
 * "Restart to Update". Called by the updater service when a download becomes
 * ready. `null` restores the default item.
 */
export function setUpdateReadyInMenu(version: string | null) {
  ApplicationMenu.setApplicationMenu(_buildMenu(version !== null));
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
 * once after the window exists.
 */
export function registerMenuActions(
  window: BrowserWindow,
  executeCommand: (command: Command, window: BrowserWindow) => void
) {
  ApplicationMenu.setApplicationMenu(_buildMenu(false));
  ApplicationMenu.on("application-menu-clicked", (event) => {
    const { action } = (event as { data: { action: string } }).data;
    const command = MENU_ACTION_COMMANDS[action];
    if (command) executeCommand(command, window);
  });
}
