import {
  ApplicationMenu,
  type ApplicationMenuItemConfig,
  type BrowserWindow,
} from "electrobun/bun";

import type { Command } from "../../shared/commands";

import { isChineseLocale } from "./locales";

const IS_WINDOWS = process.platform === "win32";
const WINDOWS_DISPLAY_ONLY_ACCELERATOR = "DisplayOnly";

/**
 * Electrobun 1.18.1 builds a Win32 accelerator table but translates key
 * messages against the focused child WebView HWND. The keystroke is consumed,
 * while the resulting WM_COMMAND never reaches the top-level app window. Keep
 * the shortcut visible in Windows menus and let the renderer command bus handle
 * it instead. Other platforms retain Electrobun's native accelerators.
 */
function _shortcut(label: string, accelerator: string) {
  if (!IS_WINDOWS) return { label, accelerator };
  const display = accelerator
    .replace("CommandOrControl", "Ctrl")
    .replace("Option", "Alt")
    .replace(/Plus$/, "+");
  return { label: `${label}\t${display}` };
}

/**
 * Electrobun assigns accelerators to edit roles when none is provided. An
 * intentionally unparseable value suppresses that Windows-only registration so
 * standard editing keystrokes continue through to WebView; menu clicks still
 * use the native role.
 */
function _editRole(
  role: string,
  label: string,
  windowsAccelerator: string
): ApplicationMenuItemConfig {
  if (!IS_WINDOWS) return { role };
  return {
    role,
    label: `${label}\t${windowsAccelerator}`,
    accelerator: WINDOWS_DISPLAY_ONLY_ACCELERATOR,
  };
}

function _roleShortcut(
  role: string,
  label: string,
  accelerator: string
): ApplicationMenuItemConfig {
  if (!IS_WINDOWS) return { role, accelerator };
  const { label: displayLabel } = _shortcut(label, accelerator);
  return {
    role,
    label: displayLabel,
    accelerator: WINDOWS_DISPLAY_ONLY_ACCELERATOR,
  };
}

/**
 * The app (first) submenu. Its update item is the one dynamic piece: normally
 * "Check for Updates…"; once an update is downloaded it becomes
 * "Restart to Update" (VS Code pattern). `setUpdateReadyInMenu` rebuilds the
 * whole menu — `setApplicationMenu` is idempotent and can be re-called anytime.
 */
function _appSubmenu(updateReady: boolean): ApplicationMenuItemConfig {
  const updateItem = updateReady
    ? { label: "Restart to Update", action: "restartToUpdate" }
    : { label: "Check for Updates...", action: "checkForUpdates" };
  return {
    submenu: [
      { label: "About LLM Space", role: "about" },
      updateItem,
      { type: "divider" },
      {
        ..._shortcut("Settings...", "CommandOrControl+,"),
        action: "settings",
      },
      { type: "divider" },
      { role: "hide", accelerator: "CommandOrControl+H" },
      { role: "hideOthers", accelerator: "CommandOrControl+Shift+H" },
      { role: "showAll" },
      { type: "divider" },
      {
        label: "Quit LLM Space",
        role: "quit",
        accelerator: "CommandOrControl+Q",
      },
    ],
  };
}

function _buildMenu(updateReady: boolean): ApplicationMenuItemConfig[] {
  return [
    _appSubmenu(updateReady),
    {
      label: "File",
      submenu: [
        {
          ..._shortcut("New File", "CommandOrControl+N"),
          action: "newThread",
        },
        { label: "New from Examples...", action: "newFromExamples" },
        { type: "divider" },
        {
          ..._shortcut("New Folder", "CommandOrControl+Shift+N"),
          action: "newFolder",
        },
        { type: "divider" },
        { label: "Import from Files...", action: "importFiles" },
        { label: "Import from Clipboard", action: "importFromClipboard" },
        { type: "divider" },
        { label: "Share...", action: "shareThread" },
        { type: "divider" },
        { label: "Refresh Workspace", action: "refreshTree" },
        { label: "Reveal Workspace Folder", action: "revealWorkspaceFolder" },
        { type: "divider" },
        {
          ..._shortcut("Close Tab", "CommandOrControl+W"),
          action: "closeTab",
        },
        { label: "Close Others", action: "closeOtherTabs" },
        { label: "Close All Tabs", action: "closeAllTabs" },
        { type: "divider" },
        {
          ..._shortcut("Reopen Closed Tabs", "CommandOrControl+Shift+T"),
          action: "reopenClosedTabs",
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        _editRole("undo", "Undo", "Ctrl+Z"),
        _editRole("redo", "Redo", "Ctrl+Y"),
        { type: "divider" },
        _editRole("cut", "Cut", "Ctrl+X"),
        _editRole("copy", "Copy", "Ctrl+C"),
        _editRole("paste", "Paste", "Ctrl+V"),
        _editRole(
          "pasteAndMatchStyle",
          "Paste and Match Style",
          "Ctrl+Shift+V"
        ),
        _editRole("delete", "Delete", "Del"),
        _editRole("selectAll", "Select All", "Ctrl+A"),
      ],
    },
    {
      label: "View",
      submenu: [
        {
          ..._shortcut("Command Palette...", "CommandOrControl+Shift+P"),
          action: "commandPalette",
        },
        { type: "divider" },
        {
          ..._shortcut("Toggle Sidebar", "CommandOrControl+B"),
          action: "toggleSidebar",
        },
        { type: "divider" },
        {
          ..._shortcut("Reload", "CommandOrControl+Shift+R"),
          action: "reload",
        },
        { type: "divider" },
        {
          ..._shortcut("Zoom In", "CommandOrControl+Plus"),
          action: "zoomIn",
        },
        {
          ..._shortcut("Zoom Out", "CommandOrControl+-"),
          action: "zoomOut",
        },
        {
          ..._shortcut("Reset Zoom", "CommandOrControl+0"),
          action: "resetZoom",
        },
      ],
    },
    {
      label: "Window",
      role: "window",
      submenu: [
        { role: "minimize" },
        { role: "bringAllToFront" },
        { type: "divider" },
        {
          ..._shortcut("Select Previous Tab", "CommandOrControl+Option+Left"),
          action: "selectPreviousTab",
        },
        {
          ..._shortcut("Select Next Tab", "CommandOrControl+Option+Right"),
          action: "selectNextTab",
        },
        { type: "divider" },
        _roleShortcut(
          "toggleFullScreen",
          "Toggle Full Screen",
          "CommandOrControl+Shift+F"
        ),
      ],
    },
    {
      label: "Help",
      submenu: [
        { label: "View Documentation", action: "openDocument" },
        { type: "divider" },
        { label: "Visit Official Website", action: "openOfficialWebsite" },
        { label: "Visit GitHub Project", action: "openGitHubProject" },
        { label: "Visit Harness 101", action: "openHarness101" },
        { type: "divider" },
        { label: "Report Bug", action: "reportBugs" },
        { label: "Donate", action: "donate" },
        { type: "divider" },
        { label: "Onboard", action: "onboard" },
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
