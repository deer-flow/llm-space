import type { PluginDefinition, PluginManifest } from "@llm-space/plugin-api";

export interface PluginRuntimeModule<TThread = unknown> {
  default?: PluginDefinition<TThread>;
  plugin?: PluginDefinition<TThread>;
}

export interface BundledPlugin<TThread = unknown> {
  manifest: PluginManifest;
  /** Load runtime handlers only after manifest validation and first use. */
  load(): Promise<PluginRuntimeModule<TThread>>;
}

export interface SeededPluginSource<TThread = unknown> {
  pluginId: string;
  seederId: string;
  workspacePath?: string;
  result: import("@llm-space/plugin-api").PluginSourceImportResult<TThread>;
}
