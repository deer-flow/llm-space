import type { JsonObject, JsonValue } from "./shared";
import type { ThreadLocator } from "./storage";
import type { Thread } from "./threads";

export type PluginStatus =
  "disabled" | "active" | "degraded" | "error" | "incompatible";

export type PluginExtensionKind =
  "skill" | "mcp" | "model" | "command" | "threadStorage" | "settings";

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
  active: boolean;
  error?: PluginSafeError;
}

export interface PluginCommandView {
  id: string;
  pluginId: string;
  displayName: string;
  description?: string;
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
