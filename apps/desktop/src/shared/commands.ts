/**
 * The unified command layer. Every user action that is dispatched across
 * components or across the bun/webview boundary (menus, context menus, toolbar
 * buttons, keyboard shortcuts) is modelled as a {@link Command}: a `type`
 * discriminant plus strongly-typed `args`. A single `executeCommand(command)`
 * on each side routes it to the right handler, replacing the previous
 * one-RPC-method-per-action sprawl.
 */

import type { RuntimeId } from "./runtime";
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
  { parent?: string; rename?: boolean; runtimeId?: RuntimeId }
> {}

/**
 * Create a new thread from a built-in prompt example. The command carries only
 * the example's `id`; the file-tree handler resolves the full definition (system
 * prompt, seed tools, seed messages) from the example catalog via
 * `getPromptExample`. `parent` defaults to the workspace root.
 */
export interface NewFileFromPromptExampleCommand extends GenericCommand<
  "newFileFromPromptExample",
  { parent?: string; exampleId: string; runtimeId?: RuntimeId }
> {}

/**
 * Open the "Start from Example" dialog. `parent` (default: workspace root) is
 * where the chosen example's thread will be created.
 */
export interface OpenStartFromExampleCommand extends GenericCommand<
  "openStartFromExample",
  { parent?: string; runtimeId?: RuntimeId }
> {}

/** Create a new folder (with in-place rename). `parent` defaults to the root. */
export interface NewFolderCommand extends GenericCommand<
  "newFolder",
  { parent?: string; runtimeId?: RuntimeId }
> {}

/** Start an in-place rename of the node at `path`. */
export interface RenameFileCommand extends GenericCommand<
  "renameFile",
  { path: string; runtimeId?: RuntimeId }
> {}

/** Duplicate the node at `path`. */
export interface DuplicateFileCommand extends GenericCommand<
  "duplicateFile",
  { path: string; runtimeId?: RuntimeId }
> {}

/** Move the node at `path` to the OS trash (via a confirm dialog). */
export interface DeleteFileCommand extends GenericCommand<
  "deleteFile",
  { path: string; runtimeId?: RuntimeId }
> {}

/** Reveal the node at `path` in the OS file manager (`""` = the root). */
export interface RevealFileCommand extends GenericCommand<
  "revealFile",
  { path: string; runtimeId?: RuntimeId }
> {}

/**
 * Copy the file at the **absolute** `path` to the OS clipboard as a file
 * reference, so it can be pasted into Finder/Explorer or other apps. Runs in the
 * bun process (native clipboard). macOS/Windows only.
 */
export interface CopyFileCommand extends GenericCommand<
  "copyFile",
  { path: string; runtimeId?: RuntimeId }
> {}

/** Refresh (re-list) the file tree. */
export interface RefreshTreeCommand extends GenericCommand<
  "refreshTree",
  { runtimeId?: RuntimeId }
> {}

/**
 * Reveal a workspace file in the tree: expand its ancestor folders, refresh the
 * listing, then select, open, and scroll to it once it appears (e.g. after a
 * deep-link import writes into `shared/`).
 */
export interface RevealInTreeCommand extends GenericCommand<
  "revealInTree",
  { path: string; runtimeId?: RuntimeId }
> {}

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
  { parent?: string; files?: ImportFilePayload[]; runtimeId?: RuntimeId }
> {}

/**
 * Import a thread from the OS clipboard's text content. The bun process reads
 * the native clipboard, then forwards a virtual JSON file to the renderer so
 * parsing/writing stays shared with file imports.
 */
export interface ImportFromClipboardCommand extends GenericCommand<
  "importFromClipboard",
  { parent?: string; runtimeId?: RuntimeId }
> {}

// --- Traces ----------------------------------------------------------------

/**
 * Create a trace project in `LLM_SPACE_HOME/traces`. The caller supplies a
 * non-empty display `name`; the trace panel handler selects the created project
 * and refreshes the trace-project list.
 */
export interface CreateTraceProjectCommand extends GenericCommand<
  "createTraceProject",
  { name: string; runtimeId?: RuntimeId }
> {}

/**
 * Create a connected Langfuse trace project after testing credentials. The full
 * secret is carried only to the Bun process; renderer feedback must be redacted.
 */
export interface CreateConnectedTraceProjectCommand extends GenericCommand<
  "createConnectedTraceProject",
  TraceConnectedProjectInput & { runtimeId?: RuntimeId }
> {}

/**
 * Import Langfuse observation export files into one trace project. `files` are
 * already read by the renderer picker; the bun-side trace manager writes
 * `raw.json` / `trace.json` and reports skipped files plus source warnings.
 */
export interface ImportLangfuseTraceFilesCommand extends GenericCommand<
  "importLangfuseTraceFiles",
  { projectId: string; files: TraceImportFile[]; runtimeId?: RuntimeId }
> {}

/** Sync selected remote Langfuse trace ids into a connected trace project. */
export interface SyncLangfuseTraceIdsCommand extends GenericCommand<
  "syncLangfuseTraceIds",
  { projectId: string; traceIds: string[]; runtimeId?: RuntimeId }
> {}

// --- Tabs ------------------------------------------------------------------

/**
 * Close a tab. `id` is the app-tab id (`thread:{path}` or `trace:{project}:{key}`);
 * `path` is kept for legacy thread callers; omitting both closes the active tab.
 */
export interface CloseTabCommand extends GenericCommand<
  "closeTab",
  { id?: string; path?: string; runtimeId?: RuntimeId }
> {}

/**
 * Close every tab except the target. Prefer `id`; `path` is a legacy thread
 * path; omitting both keeps the active tab.
 */
export interface CloseOtherTabsCommand extends GenericCommand<
  "closeOtherTabs",
  { id?: string; path?: string; runtimeId?: RuntimeId }
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
  | "account"
  | "general"
  | "models"
  | "mcp"
  | "network"
  | "remote"
  | "search"
  | "skills"
  | "plugins"
  | "experimental";

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
 * Open the Share dialog for a thread. `path` + `runtimeId` target a specific
 * thread file (tree/tab context menus and playground header); omitting them
 * shares the active thread (native menu and command palette). No-op when there
 * is no active thread tab. Webview only.
 */
export interface ShareThreadCommand extends GenericCommand<
  "shareThread",
  { path?: string; runtimeId?: RuntimeId }
> {}

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
  { path?: string; runtimeId?: RuntimeId }
> {}

/** Open the GitHub issues page in the user's default browser to report a bug. */
export interface ReportBugsCommand extends GenericCommand<"reportBugs"> {}

/** Open the workspace folder (`LLM_SPACE_HOME/workspace`) in the OS file manager. */
export interface OpenWorkspaceFolderCommand extends GenericCommand<"openWorkspaceFolder"> {}

// --- GitHub auth (bun-side) ------------------------------------------------

/**
 * Start the GitHub OAuth Device Flow: the bun side requests a code, opens the
 * verification window, and polls for the token. Modelled as a command so any
 * surface (Account page, a future "sign in to share" prompt) can trigger it.
 */
export interface GithubLoginCommand extends GenericCommand<"githubLogin"> {}

/** Sign out of GitHub: forget the stored token. */
export interface GithubLogoutCommand extends GenericCommand<"githubLogout"> {}

// --- Updates ---------------------------------------------------------------

/**
 * Manually check for an app update (and download it when one is found). The
 * bun-side updater reports progress back over the `updateStatusChanged` RPC
 * message; see `shared/updates.ts`.
 */
export interface CheckForUpdatesCommand extends GenericCommand<"checkForUpdates"> {}

/** Apply a downloaded update: quit, swap the app bundle, relaunch. */
export interface ApplyUpdateAndRestartCommand extends GenericCommand<"applyUpdateAndRestart"> {}

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
  | RevealInTreeCommand
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
  | ShareThreadCommand
  | OpenVariablesCommand
  | ZoomInCommand
  | ZoomOutCommand
  | ResetZoomCommand
  | ReloadCommand
  | OpenLinkCommand
  | OpenDocumentCommand
  | ReportBugsCommand
  | OpenWorkspaceFolderCommand
  | GithubLoginCommand
  | GithubLogoutCommand
  | CheckForUpdatesCommand
  | ApplyUpdateAndRestartCommand;

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
 * zoom / reload). Human-facing labels no longer live here — they resolve
 * through the i18n dictionary (`t.commands[type]` from
 * `@llm-space/ui/lib/i18n/messages`), whose key set mirrors this file's
 * `CommandType`s one-for-one.
 */
export const COMMAND_META: Record<CommandType, { target: "webview" | "bun" }> = {
  newFile: { target: "webview" },
  newFileFromPromptExample: { target: "webview" },
  openStartFromExample: { target: "webview" },
  newFolder: { target: "webview" },
  renameFile: { target: "webview" },
  duplicateFile: { target: "webview" },
  deleteFile: { target: "webview" },
  revealFile: { target: "webview" },
  copyFile: { target: "bun" },
  refreshTree: { target: "webview" },
  revealInTree: { target: "webview" },
  importFiles: { target: "webview" },
  importFromClipboard: { target: "bun" },
  createTraceProject: { target: "webview" },
  createConnectedTraceProject: { target: "webview" },
  importLangfuseTraceFiles: { target: "webview" },
  syncLangfuseTraceIds: { target: "webview" },
  closeTab: { target: "webview" },
  closeOtherTabs: { target: "webview" },
  closeAllTabs: { target: "webview" },
  reopenClosedTab: { target: "webview" },
  selectNextTab: { target: "webview" },
  selectPreviousTab: { target: "webview" },
  toggleSidebar: { target: "webview" },
  openSettings: { target: "webview" },
  openModelSettings: { target: "webview" },
  openCommandPalette: { target: "webview" },
  openOnboard: { target: "webview" },
  runThread: { target: "webview" },
  shareThread: { target: "webview" },
  openVariables: { target: "webview" },
  zoomIn: { target: "bun" },
  zoomOut: { target: "bun" },
  resetZoom: { target: "bun" },
  reload: { target: "bun" },
  openLink: { target: "bun" },
  openDocument: { target: "bun" },
  reportBugs: { target: "bun" },
  openWorkspaceFolder: { target: "bun" },
  githubLogin: { target: "bun" },
  githubLogout: { target: "bun" },
  checkForUpdates: { target: "bun" },
  applyUpdateAndRestart: { target: "bun" },
};
