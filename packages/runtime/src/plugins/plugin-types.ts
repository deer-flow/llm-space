import type {
  JsonObject,
  PluginExtensionView,
  PluginSafeError,
  PluginStatus,
} from "@llm-space/core";
import type { McpServerConfig } from "@llm-space/core";

import type { ProviderConfig } from "../models/types";

export interface PluginPackageMetadata {
  name: string;
  version: string;
  displayName?: string;
  description?: string;
  author?: string | { name?: string };
  license?: string;
  homepage?: string;
  engines: { "llm-space": string };
}

export interface DiscoveredPlugin {
  id: string;
  rootPath: string;
  metadata: PluginPackageMetadata;
  compatible: boolean;
  iconPath?: string;
  iconDataUrl?: string;
  skillPaths: string[];
  mcpPath?: string;
  modelsPath?: string;
  commandPaths: string[];
  toolPaths: string[];
  threadStoragePaths: string[];
  settingsSchemaPath?: string;
}

export interface PluginRecord extends DiscoveredPlugin {
  enabled: boolean;
  settings: JsonObject;
  settingsSchema?: JsonObject;
  status: PluginStatus;
  extensions: PluginExtensionView[];
  error?: PluginSafeError;
  mcpServers: McpServerConfig[];
  modelProviders: ProviderConfig[];
}

export interface PluginDiscoveryFailure {
  id: string;
  rootPath: string;
  error: PluginSafeError;
}
