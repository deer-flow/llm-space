/**
 * Native-menu labels (macOS menu bar only). Several items deliberately differ
 * from the command-palette copy in `t.commands` — e.g. the menu's plural
 * "Reopen Closed Tabs" vs the palette's "Reopen Closed Tab". Role items (the
 * Edit submenu, Window minimize/bringAllToFront/toggleFullScreen) are
 * OS-localized and have no labels here.
 */
export const menu = {
  app: {
    about: "About LLM Space",
    checkUpdates: "Check for Updates…",
    restartToUpdate: "Restart to Update",
    settings: "Settings…",
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
