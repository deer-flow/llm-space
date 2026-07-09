/**
 * The unified command layer. Every user action that is dispatched across
 * components or across the bun/webview boundary (menus, context menus, toolbar
 * buttons, keyboard shortcuts) is modelled as a {@link Command}: a `type`
 * discriminant plus strongly-typed `args`. A single `executeCommand(command)`
 * on each side routes it to the right handler, replacing the previous
 * one-RPC-method-per-action sprawl.
 */

import type { TraceConnectedProjectInput, TraceImportFile } from "./traces";

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
 * Create a new thread from a built-in prompt example. The command carries only
 * the example's `id`; the file-tree handler resolves the full definition (system
 * prompt, seed tools, seed messages) from the example catalog via
 * `getPromptExample`. `parent` defaults to the workspace root.
 */
export interface NewFileFromPromptExampleCommand extends GenericCommand<
  "newFileFromPromptExample",
  { parent?: string; exampleId: string }
> {}

/**
 * Open the "Start from Example" dialog. `parent` (default: workspace root) is
 * where the chosen example's thread will be created.
 */
export interface OpenStartFromExampleCommand extends GenericCommand<
  "openStartFromExample",
  { parent?: string }
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

/**
 * Copy the file at the **absolute** `path` to the OS clipboard as a file
 * reference, so it can be pasted into Finder/Explorer or other apps. Runs in the
 * bun process (native clipboard). macOS/Windows only.
 */
export interface CopyFileCommand extends GenericCommand<
  "copyFile",
  { path: string }
> {}

/** Refresh (re-list) the file tree. */
export interface RefreshTreeCommand extends GenericCommand<"refreshTree"> {}

export interface ImportFilePayload {
  name: string;
  text: string;
}

/**
 * Import one or more external files (OpenAI / Anthropic / native thread JSON)
 * into the workspace as new thread files. When `files` is absent the renderer
 * opens its hidden picker; native menu actions fill `files` from the OS dialog.
 */
export interface ImportFilesCommand extends GenericCommand<
  "importFiles",
  { parent?: string; files?: ImportFilePayload[] }
> {}

/**
 * Import a thread from the OS clipboard's text content. The bun process reads
 * the native clipboard, then forwards a virtual JSON file to the renderer so
 * parsing/writing stays shared with file imports.
 */
export interface ImportFromClipboardCommand extends GenericCommand<
  "importFromClipboard",
  { parent?: string }
> {}

// --- Traces ----------------------------------------------------------------

/**
 * Create a trace project in `LLM_SPACE_HOME/traces`. The caller supplies a
 * non-empty display `name`; the trace panel handler selects the created project
 * and refreshes the trace-project list.
 */
export interface CreateTraceProjectCommand extends GenericCommand<
  "createTraceProject",
  { name: string }
> {}

/**
 * Create a connected Langfuse trace project after testing credentials. The full
 * secret is carried only to the Bun process; renderer feedback must be redacted.
 */
export interface CreateConnectedTraceProjectCommand extends GenericCommand<
  "createConnectedTraceProject",
  TraceConnectedProjectInput
> {}

/**
 * Import Langfuse observation export files into one trace project. `files` are
 * already read by the renderer picker; the bun-side trace manager writes
 * `raw.json` / `trace.json` and reports skipped files plus source warnings.
 */
export interface ImportLangfuseTraceFilesCommand extends GenericCommand<
  "importLangfuseTraceFiles",
  { projectId: string; files: TraceImportFile[] }
> {}

/** Sync selected remote Langfuse trace ids into a connected trace project. */
export interface SyncLangfuseTraceIdsCommand extends GenericCommand<
  "syncLangfuseTraceIds",
  { projectId: string; traceIds: string[] }
> {}

// --- Tabs ------------------------------------------------------------------

/**
 * Close a tab. `id` is the app-tab id (`thread:{path}` or `trace:{project}:{key}`);
 * `path` is kept for legacy thread callers; omitting both closes the active tab.
 */
export interface CloseTabCommand extends GenericCommand<
  "closeTab",
  { id?: string; path?: string }
> {}

/**
 * Close every tab except the target. Prefer `id`; `path` is a legacy thread
 * path; omitting both keeps the active tab.
 */
export interface CloseOtherTabsCommand extends GenericCommand<
  "closeOtherTabs",
  { id?: string; path?: string }
> {}

/** Close every open tab. */
export interface CloseAllTabsCommand extends GenericCommand<"closeAllTabs"> {}

/** Reopen the most recently closed tab group. */
export interface ReopenClosedTabCommand extends GenericCommand<"reopenClosedTab"> {}

/** Activate the tab after the active one in visual order, wrapping around. */
export interface SelectNextTabCommand extends GenericCommand<"selectNextTab"> {}

/** Activate the tab before the active one in visual order, wrapping around. */
export interface SelectPreviousTabCommand extends GenericCommand<"selectPreviousTab"> {}

// --- View / app ------------------------------------------------------------

/** Collapse or expand the left side panel. */
export interface ToggleSidebarCommand extends GenericCommand<"toggleSidebar"> {}

/** Which Settings tab to show. */
export type SettingsTab =
  "general" | "models" | "mcp" | "search" | "skills" | "experimental";

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

/**
 * Open the Variables dialog for the active thread. When `variableName` is given,
 * the dialog opens focused on that variable; otherwise it opens at the default
 * selection. Webview only, and intentionally excluded from the command palette.
 */
export interface OpenVariablesCommand extends GenericCommand<
  "openVariables",
  { variableName?: string }
> {}

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

/** Open the workspace folder (`LLM_SPACE_HOME/workspace`) in the OS file manager. */
export interface OpenWorkspaceFolderCommand extends GenericCommand<"openWorkspaceFolder"> {}

/** The discriminated union of every command. */
export type Command =
  | NewFileCommand
  | NewFileFromPromptExampleCommand
  | OpenStartFromExampleCommand
  | NewFolderCommand
  | RenameFileCommand
  | DuplicateFileCommand
  | DeleteFileCommand
  | RevealFileCommand
  | CopyFileCommand
  | RefreshTreeCommand
  | ImportFilesCommand
  | ImportFromClipboardCommand
  | CreateTraceProjectCommand
  | CreateConnectedTraceProjectCommand
  | ImportLangfuseTraceFilesCommand
  | SyncLangfuseTraceIdsCommand
  | CloseTabCommand
  | CloseOtherTabsCommand
  | CloseAllTabsCommand
  | ReopenClosedTabCommand
  | SelectNextTabCommand
  | SelectPreviousTabCommand
  | ToggleSidebarCommand
  | OpenSettingsCommand
  | OpenModelSettingsCommand
  | OpenCommandPaletteCommand
  | OpenOnboardCommand
  | RunThreadCommand
  | OpenVariablesCommand
  | ZoomInCommand
  | ZoomOutCommand
  | ResetZoomCommand
  | ReloadCommand
  | OpenLinkCommand
  | OpenDocumentCommand
  | ReportBugsCommand
  | OpenWorkspaceFolderCommand;

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
  openStartFromExample: {
    label: "New from Examples...",
    target: "webview",
  },
  newFolder: { label: "New Folder", target: "webview" },
  renameFile: { label: "Rename", target: "webview" },
  duplicateFile: { label: "Duplicate", target: "webview" },
  deleteFile: { label: "Move to Trash", target: "webview" },
  revealFile: { label: "Reveal in Finder", target: "webview" },
  copyFile: { label: "Copy", target: "bun" },
  refreshTree: { label: "Refresh", target: "webview" },
  importFiles: { label: "Import from Files...", target: "webview" },
  importFromClipboard: { label: "Import from Clipboard", target: "bun" },
  createTraceProject: { label: "New Trace Project", target: "webview" },
  createConnectedTraceProject: {
    label: "Connect Langfuse",
    target: "webview",
  },
  importLangfuseTraceFiles: {
    label: "Import Langfuse Export...",
    target: "webview",
  },
  syncLangfuseTraceIds: { label: "Sync Langfuse Traces", target: "webview" },
  closeTab: { label: "Close Tab", target: "webview" },
  closeOtherTabs: { label: "Close Other Tabs", target: "webview" },
  closeAllTabs: { label: "Close All Tabs", target: "webview" },
  reopenClosedTab: { label: "Reopen Closed Tab", target: "webview" },
  selectNextTab: { label: "Select Next Tab", target: "webview" },
  selectPreviousTab: { label: "Select Previous Tab", target: "webview" },
  toggleSidebar: { label: "Toggle Sidebar", target: "webview" },
  openSettings: { label: "Settings", target: "webview" },
  openModelSettings: { label: "Configure Model Settings", target: "webview" },
  openCommandPalette: { label: "Command Palette", target: "webview" },
  openOnboard: { label: "Onboard...", target: "webview" },
  runThread: { label: "Run Thread", target: "webview" },
  openVariables: { label: "Variables", target: "webview" },
  zoomIn: { label: "Zoom In", target: "bun" },
  zoomOut: { label: "Zoom Out", target: "bun" },
  resetZoom: { label: "Reset Zoom", target: "bun" },
  reload: { label: "Reload", target: "bun" },
  openLink: { label: "Open Link", target: "bun" },
  openDocument: { label: "Documents", target: "bun" },
  reportBugs: { label: "Report Bug", target: "bun" },
  openWorkspaceFolder: { label: "Open Workspace Folder", target: "bun" },
};
