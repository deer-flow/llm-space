import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { getLlmSpaceHomePath } from "@llm-space/core/server";

import { MEMORY_PLUGIN_FILES, MEMORY_PLUGIN_ID } from "./memory-plugin-files";

/** The llm-space-managed plugins discovery root (`<home>/plugins`). */
export function getManagedPluginsDir(): string {
  return path.join(getLlmSpaceHomePath(), "plugins");
}

/**
 * Seed the bundled default Memory plugin into the plugins discovery root so
 * every install has cross-project memory out of the box. No-op when the
 * plugin directory already exists — a user who removed, replaced, or edited
 * the plugin is never overwritten (mirroring `seedSkills`).
 */
export function seedDefaultPlugins(pluginsDir?: string): void {
  const root = pluginsDir ?? getManagedPluginsDir();
  const pluginRoot = path.join(root, ...MEMORY_PLUGIN_ID.split("/"));
  if (existsSync(pluginRoot)) {
    return;
  }
  for (const file of MEMORY_PLUGIN_FILES) {
    const target = path.join(pluginRoot, ...file.path.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, file.content, "utf8");
  }
}
