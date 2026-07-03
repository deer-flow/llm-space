/**
 * The unified command layer. Every user action that is dispatched across
 * components or across the bun/webview boundary (menus, context menus, toolbar
 * buttons, keyboard shortcuts) is modelled as a {@link Command}: a `type`
 * discriminant plus strongly-typed `args`. A single `executeCommand(command)`
 * on each side routes it to the right handler, replacing the previous
 * one-RPC-method-per-action sprawl.
 */

/** Base shape for every command: a string `type` and typed `args`. */
export interface GenericCommand<T extends string, A = Record<string, never>> {
  type: T;
  args: A;
}

// --- File tree -------------------------------------------------------------

/**
 * Create a new thread file. `parent` defaults to the workspace root. When
 * `rename` is true the tree starts an in-place rename on the new file (used by
 * the tree/root "New file" icons); otherwise it is auto-named and opened
 * immediately (used by the ⌘N menu, the tab-bar "+", and the welcome screen).
 */
export interface NewFileCommand extends GenericCommand<
  "newFile",
  { parent?: string; rename?: boolean }
> {}

/**
 * Create a new thread from a built-in prompt example. The command carries a
 * snapshot of the selected prompt so file creation stays decoupled from the
 * UI-only example catalog.
 */
export interface NewFileFromPromptExampleCommand extends GenericCommand<
  "newFileFromPromptExample",
  {
    parent?: string;
    exampleId: string;
    fileStem: string;
    systemPrompt: string;
  }
> {}

/** Create a new folder (with in-place rename). `parent` defaults to the root. */
export interface NewFolderCommand extends GenericCommand<
  "newFolder",
  { parent?: string }
> {}

/** Start an in-place rename of the node at `path`. */
export interface RenameFileCommand extends GenericCommand<
  "renameFile",
  { path: string }
> {}

/** Duplicate the node at `path`. */
export interface DuplicateFileCommand extends GenericCommand<
  "duplicateFile",
  { path: string }
> {}

/** Move the node at `path` to the OS trash (via a confirm dialog). */
export interface DeleteFileCommand extends GenericCommand<
  "deleteFile",
  { path: string }
> {}

/** Reveal the node at `path` in the OS file manager (`""` = the root). */
export interface RevealFileCommand extends GenericCommand<
  "revealFile",
  { path: string }
> {}

/** Refresh (re-list) the file tree. */
export interface RefreshTreeCommand extends GenericCommand<"refreshTree"> {}

/**
 * Import one or more external files (OpenAI / Anthropic / native thread JSON)
 * into the workspace as new thread files. Opens a file picker; each file that
 * parses into a thread is written under `parent` (defaults to the root).
 */
export interface ImportFilesCommand extends GenericCommand<
  "importFiles",
  { parent?: string }
> {}

// --- Tabs ------------------------------------------------------------------

/** Close a tab. `path` defaults to the active tab. */
export interface CloseTabCommand extends GenericCommand<
  "closeTab",
  { path?: string }
> {}

/** Close every tab except `path` (defaults to the active tab). */
export interface CloseOtherTabsCommand extends GenericCommand<
  "closeOtherTabs",
  { path?: string }
> {}

/** Close every open tab. */
export interface CloseAllTabsCommand extends GenericCommand<"closeAllTabs"> {}

/** Reopen the most recently closed tab group. */
export interface ReopenClosedTabCommand extends GenericCommand<"reopenClosedTab"> {}

// --- View / app ------------------------------------------------------------

/** Collapse or expand the left side panel. */
export interface ToggleSidebarCommand extends GenericCommand<"toggleSidebar"> {}

/** Which Settings tab to show. */
export type SettingsTab = "general" | "models";

/** Open the Settings dialog, optionally on a specific `tab`. */
export interface OpenSettingsCommand extends GenericCommand<
  "openSettings",
  { tab?: SettingsTab }
> {}

/** Open the Settings dialog directly on the Models tab. */
export interface OpenModelSettingsCommand extends GenericCommand<"openModelSettings"> {}

/** Open the command palette. */
export interface OpenCommandPaletteCommand extends GenericCommand<"openCommandPalette"> {}

/** Open the first-run onboarding dialog. */
export interface OpenOnboardCommand extends GenericCommand<"openOnboard"> {}

/** Run the active thread. No-op when there is no active thread tab. */
export interface RunThreadCommand extends GenericCommand<"runThread"> {}

// --- Window (bun-side) -----------------------------------------------------

/** Zoom the page in one step. */
export interface ZoomInCommand extends GenericCommand<"zoomIn"> {}
/** Zoom the page out one step. */
export interface ZoomOutCommand extends GenericCommand<"zoomOut"> {}
/** Reset the page zoom to 100%. */
export interface ResetZoomCommand extends GenericCommand<"resetZoom"> {}
/** Reload the webview. */
export interface ReloadCommand extends GenericCommand<"reload"> {}

/** Open a URL in the user's default browser (via the OS). */
export interface OpenLinkCommand extends GenericCommand<
  "openLink",
  { url: string }
> {}

/**
 * Open the documentation website in the user's default browser. `path` may point
 * at a specific doc page (currently ignored — always opens the docs home).
 */
export interface OpenDocumentCommand extends GenericCommand<
  "openDocument",
  { path?: string }
> {}

/** Open the GitHub issues page in the user's default browser to report a bug. */
export interface ReportBugsCommand extends GenericCommand<"reportBugs"> {}

/** The discriminated union of every command. */
export type Command =
  | NewFileCommand
  | NewFileFromPromptExampleCommand
  | NewFolderCommand
  | RenameFileCommand
  | DuplicateFileCommand
  | DeleteFileCommand
  | RevealFileCommand
  | RefreshTreeCommand
  | ImportFilesCommand
  | CloseTabCommand
  | CloseOtherTabsCommand
  | CloseAllTabsCommand
  | ReopenClosedTabCommand
  | ToggleSidebarCommand
  | OpenSettingsCommand
  | OpenModelSettingsCommand
  | OpenCommandPaletteCommand
  | OpenOnboardCommand
  | RunThreadCommand
  | ZoomInCommand
  | ZoomOutCommand
  | ResetZoomCommand
  | ReloadCommand
  | OpenLinkCommand
  | OpenDocumentCommand
  | ReportBugsCommand;

/** The `type` string of any command. */
export type CommandType = Command["type"];

/** The `args` type for a specific command `type`. */
export type CommandArgs<T extends CommandType> = Extract<
  Command,
  { type: T }
>["args"];

/**
 * Where a command executes: `"webview"` commands run in the renderer (tab /
 * tree / sidebar state); `"bun"` commands run in the main process (window
 * zoom / reload). `label` is the human-facing name in Title Case (e.g. for a
 * command palette or context menu), matching dropdown/context/native menus.
 */
export const COMMAND_META: Record<
  CommandType,
  { label: string; target: "webview" | "bun" }
> = {
  newFile: { label: "New File", target: "webview" },
  newFileFromPromptExample: {
    label: "Start from Example",
    target: "webview",
  },
  newFolder: { label: "New Folder", target: "webview" },
  renameFile: { label: "Rename", target: "webview" },
  duplicateFile: { label: "Duplicate", target: "webview" },
  deleteFile: { label: "Move to Trash", target: "webview" },
  revealFile: { label: "Reveal in Finder", target: "webview" },
  refreshTree: { label: "Refresh", target: "webview" },
  importFiles: { label: "Import from Files...", target: "webview" },
  closeTab: { label: "Close Tab", target: "webview" },
  closeOtherTabs: { label: "Close Other Tabs", target: "webview" },
  closeAllTabs: { label: "Close All Tabs", target: "webview" },
  reopenClosedTab: { label: "Reopen Closed Tab", target: "webview" },
  toggleSidebar: { label: "Toggle Sidebar", target: "webview" },
  openSettings: { label: "Settings", target: "webview" },
  openModelSettings: { label: "Configure Model Settings", target: "webview" },
  openCommandPalette: { label: "Command Palette", target: "webview" },
  openOnboard: { label: "Onboard...", target: "webview" },
  runThread: { label: "Run Thread", target: "webview" },
  zoomIn: { label: "Zoom In", target: "bun" },
  zoomOut: { label: "Zoom Out", target: "bun" },
  resetZoom: { label: "Reset Zoom", target: "bun" },
  reload: { label: "Reload", target: "bun" },
  openLink: { label: "Open Link", target: "bun" },
  openDocument: { label: "Documents", target: "bun" },
  reportBugs: { label: "Report Bug", target: "bun" },
};
