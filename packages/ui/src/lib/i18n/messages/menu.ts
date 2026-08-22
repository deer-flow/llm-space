/**
 * Native-menu labels (macOS menu bar only). Several items deliberately differ
 * from the command-palette copy in `t.commands` — e.g. the menu's plural
 * "Reopen Closed Tabs" vs the palette's "Reopen Closed Tab". Role items carry
 * explicit labels too: Electrobun supplies fixed English labels for roles, so
 * leaving them label-less would mix languages in the zh menu. The `role` still
 * wires the OS behavior; the label only overrides the display text.
 */
export const menu = {
  app: {
    about: "About LLM Space",
    checkUpdates: "Check for Updates…",
    restartToUpdate: "Restart to Update",
    settings: "Settings…",
    hide: "Hide LLM Space",
    hideOthers: "Hide Others",
    showAll: "Show All",
    quit: "Quit LLM Space",
  },
  file: {
    label: "File",
    newFile: "New File",
    newFromExamples: "New from Examples…",
    newFolder: "New Folder",
    importFiles: "Import from Files…",
    importClipboard: "Import from Clipboard",
    share: "Share…",
    refreshWorkspace: "Refresh Workspace",
    revealWorkspace: "Reveal Workspace Folder",
    closeTab: "Close Tab",
    closeOthers: "Close Others",
    closeAll: "Close All Tabs",
    reopenClosed: "Reopen Closed Tabs",
  },
  edit: {
    label: "Edit",
    undo: "Undo",
    redo: "Redo",
    cut: "Cut",
    copy: "Copy",
    paste: "Paste",
    pasteAndMatchStyle: "Paste and Match Style",
    delete: "Delete",
    selectAll: "Select All",
  },
  view: {
    label: "View",
    commandPalette: "Command Palette…",
    toggleSidebar: "Toggle Sidebar",
    reload: "Reload",
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",
    resetZoom: "Reset Zoom",
  },
  window: {
    label: "Window",
    minimize: "Minimize",
    bringAllToFront: "Bring All to Front",
    toggleFullScreen: "Toggle Full Screen",
    selectPrevious: "Select Previous Tab",
    selectNext: "Select Next Tab",
  },
  help: {
    label: "Help",
    viewDocs: "View Documentation",
    officialSite: "Visit Official Website",
    github: "Visit GitHub Project",
    harness101: "Visit Harness 101",
    reportBug: "Report Bug",
    donate: "Donate",
    onboard: "Onboard",
  },
};
