import path from "node:path";

import { Thread, type Thread as ThreadType } from "@llm-space/core";
import { getLlmSpaceHomePath, getSettingsDir } from "@llm-space/core/server";
import pluginApiPackage from "@llm-space/plugin-api/package.json" with { type: "json" };
import { Compile } from "typebox/compile";

import desktopPackage from "../../../package.json" with { type: "json" };

import { BUNDLED_PLUGINS } from "./bundled-plugins";
import { PluginManager } from "./plugin-manager";

export const PLUGIN_API_VERSION = pluginApiPackage.version;
export const LLM_SPACE_ENGINE_VERSION = desktopPackage.version;

const localPaths = (process.env.LLM_SPACE_PLUGIN_PATHS ?? "")
  .split(path.delimiter)
  .map((entry) => entry.trim())
  .filter(Boolean);

const threadValidator = Compile(Thread);

export const pluginManager = new PluginManager<ThreadType>({
  apiVersion: PLUGIN_API_VERSION,
  engineVersion: LLM_SPACE_ENGINE_VERSION,
  bundledPlugins: BUNDLED_PLUGINS,
  localPaths,
  settingsPath: path.join(getSettingsDir(), "plugins.json"),
  storageRoot: path.join(getLlmSpaceHomePath(), "plugins"),
  validateThread: (value): value is ThreadType => threadValidator.Check(value),
});

pluginManager.initialize();

export { PluginManager } from "./plugin-manager";
export type { BundledPlugin, SeededPluginSource } from "./types";
