import type { ToolCallOutput } from "./messages";
import type { JsonObject, JsonValue } from "./shared";
import type { ThreadLocator } from "./storage";
import type { Thread } from "./threads";
import type { PluginTool } from "./tools";

export type PluginStatus =
  "disabled" | "active" | "degraded" | "error" | "incompatible";

export type PluginExtensionKind =
  | "skill"
  | "mcp"
  | "model"
  | "command"
  | "tool"
  | "threadStorage"
  | "settings";

export interface PluginSafeError {
  id: string;
  stage: string;
  summary: string;
  logPath: string;
}

export interface PluginExtensionView {
  id: string;
  kind: PluginExtensionKind;
  displayName: string;
  description?: string;
  /** Local file or directory that declares this extension, when known. */
  sourcePath?: string;
  active: boolean;
  error?: PluginSafeError;
}

export interface PluginCommandView {
  id: string;
  pluginId: string;
  displayName: string;
  description?: string;
}

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

/** Opaque structured result created by Plugin Tool context.createResult(). */
export interface PluginToolResult {
  readonly content: ToolCallOutput["content"];
}

/** Wire result returned by the isolated Plugin runner. */
export type PluginToolExecutionResult =
  | { kind: "value"; value: JsonValue }
  | { kind: "content"; content: ToolCallOutput["content"] };

/** Capabilities supplied to a Plugin Tool's execute(context, args) method. */
export interface PluginToolContext extends ThreadStorageContext {
  readonly thread: DeepReadonly<Thread>;
  readonly variables: DeepReadonly<Record<string, JsonValue>>;
  createResult(content: ToolCallOutput["content"]): PluginToolResult;
}

/** Optional compile-time contract for a class exported from tools/*.ts. */
export interface PluginToolExtension {
  name: string;
  description: string;
  parameters: PluginTool["parameters"];
  strict?: boolean;
  execute(
    context: PluginToolContext,
    args: Record<string, unknown>
  ):
    | JsonValue
    | PluginToolResult
    | Promise<JsonValue | PluginToolResult>;
  dispose?(): void | Promise<void>;
}

/** Loaded Plugin Tool definition returned to the desktop renderer. */
export type PluginToolView = PluginTool;

/** Host state captured for one Plugin Command invocation. */
export interface PluginCommandInvocationContext {
  activeTab: {
    filename: string;
    thread: Thread;
  } | null;
}

/** Internal result envelope used to apply a command's staged thread write. */
export interface PluginCommandExecutionResult {
  result: JsonValue;
  activeTabThreadUpdate?: Thread;
}

/** The thread tab that was active when a Plugin Command started. */
export interface PluginCommandActiveTab {
  readonly filename: string;
  readonly thread: Thread;
  /** Replace this tab's thread after the command succeeds. */
  writeThread(thread: Thread): Promise<void>;
}

/** Capabilities supplied to a Plugin Command's `execute(context)` method. */
export interface PluginCommandContext extends ThreadStorageContext {
  /** Shell-style arguments entered after the command name in the palette. */
  arguments: readonly string[];
  /** The active thread tab captured at invocation, or null. */
  activeTab: PluginCommandActiveTab | null;
}

export interface ThreadStorageCapabilities {
  read: boolean;
  write: boolean;
}

export interface ThreadStorageView {
  id: string;
  pluginId?: string;
  /** Optional route segment registered for `llm-space://threads/{deepLinkId}/{id}`. */
  deepLinkId?: string;
  displayName: string;
  description?: string;
  capabilities: ThreadStorageCapabilities;
  source: "builtin" | "plugin";
}

export interface ThreadStorageContext {
  settings: Readonly<JsonObject>;
  signal?: AbortSignal;
  notify(message: string): Promise<void>;
  openLink(url: string): Promise<void>;
  pickFile(options?: JsonObject): Promise<string | null>;
  readWorkspaceFile(path: string): Promise<string>;
  writeWorkspaceFile(path: string, content: string): Promise<void>;
  executeHostCommand(type: string, args?: JsonValue): Promise<JsonValue>;
}

export interface PluginThreadStorage {
  displayName: string;
  description?: string;
  /** Optional route segment registered for `llm-space://threads/{deepLinkId}/{id}`. */
  deepLinkId?: string;
  capabilities: ThreadStorageCapabilities;
  resolveLatest?(
    id: string,
    context: ThreadStorageContext
  ): Promise<ThreadLocator>;
  read?(locator: ThreadLocator, context: ThreadStorageContext): Promise<Thread>;
  write?(
    thread: Thread,
    id: string | undefined,
    context: ThreadStorageContext
  ): Promise<ThreadLocator>;
}

export interface PluginSettingsEntry {
  enabled: boolean;
  settings: JsonObject;
}

export interface PluginSettingsFile {
  schemaVersion: 1;
  plugins: Record<string, PluginSettingsEntry>;
}

export interface PluginView {
  id: string;
  displayName: string;
  version: string;
  engineRange?: string;
  description?: string;
  author?: string;
  license?: string;
  homepage?: string;
  path: string;
  iconPath?: string;
  iconDataUrl?: string;
  enabled: boolean;
  compatible: boolean;
  status: PluginStatus;
  settings: JsonObject;
  settingsSchema?: JsonObject;
  extensions: PluginExtensionView[];
  error?: PluginSafeError;
}
