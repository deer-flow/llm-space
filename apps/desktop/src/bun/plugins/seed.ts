import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { getLlmSpaceHomePath } from "@llm-space/core/server";

import {
  LEGACY_MEMORY_PLUGIN_HASHES,
  MEMORY_PLUGIN_FILES,
  MEMORY_PLUGIN_ID,
} from "./memory-plugin-files";

/** Records exactly which bundled files were written, so upgrades stay safe. */
const SEED_MARKER_FILE = ".llm-space-seed.json";

type HashMap = Record<string, string>;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** The llm-space-managed plugins discovery root (`<home>/plugins`). */
export function getManagedPluginsDir(): string {
  return path.join(getLlmSpaceHomePath(), "plugins");
}

function bundledHashes(): HashMap {
  const hashes: HashMap = {};
  for (const file of MEMORY_PLUGIN_FILES) {
    hashes[file.path] = sha256(file.content);
  }
  return hashes;
}

function markerPath(pluginRoot: string): string {
  return path.join(pluginRoot, SEED_MARKER_FILE);
}

function readMarker(pluginRoot: string): HashMap | null {
  try {
    const parsed = JSON.parse(
      readFileSync(markerPath(pluginRoot), "utf8")
    ) as { files?: HashMap };
    const files = parsed?.files;
    return files && typeof files === "object" ? files : null;
  } catch {
    return null;
  }
}

function writeMarker(pluginRoot: string, files: HashMap): void {
  writeFileSync(
    markerPath(pluginRoot),
    JSON.stringify({ plugin: MEMORY_PLUGIN_ID, files }, null, 2) + "\n",
    "utf8"
  );
}

function writePluginFiles(pluginRoot: string): void {
  for (const file of MEMORY_PLUGIN_FILES) {
    const target = path.join(pluginRoot, ...file.path.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, file.content, "utf8");
  }
}

/** Hashes of the files currently on disk, or null when one is missing. */
function hashesOnDisk(pluginRoot: string, files: string[]): HashMap | null {
  const hashes: HashMap = {};
  for (const file of files) {
    const target = path.join(pluginRoot, ...file.split("/"));
    if (!existsSync(target)) {
      return null;
    }
    hashes[file] = sha256(readFileSync(target, "utf8"));
  }
  return hashes;
}

/** True when every entry of `known` matches the file currently on disk. */
function matchesKnownHashes(known: HashMap, onDisk: HashMap): boolean {
  const keys = Object.keys(known);
  if (keys.length === 0) {
    return false;
  }
  return keys.every((file) => onDisk[file] === known[file]);
}

/**
 * Seed the bundled default Memory plugin into the plugins discovery root so
 * every install has cross-project memory out of the box.
 *
 * The plugin is rewritten only when every file on disk still matches what
 * this build (or the known 1.0.0 bundle) previously wrote — a user who
 * removed, replaced, or edited the plugin is never overwritten (mirroring
 * `seedSkills`).
 */
export function seedDefaultPlugins(pluginsDir?: string): void {
  const root = pluginsDir ?? getManagedPluginsDir();
  const pluginRoot = path.join(root, ...MEMORY_PLUGIN_ID.split("/"));
  const desired = bundledHashes();

  if (!existsSync(pluginRoot)) {
    writePluginFiles(pluginRoot);
    writeMarker(pluginRoot, desired);
    return;
  }

  const onDisk = hashesOnDisk(pluginRoot, Object.keys(desired));

  if (onDisk && matchesKnownHashes(desired, onDisk)) {
    // Already up to date; backfill the marker for installs predating it.
    if (!readMarker(pluginRoot)) {
      writeMarker(pluginRoot, desired);
    }
    return;
  }

  if (!onDisk) {
    // A file is missing; only rewrite when our marker says we own this copy.
    if (readMarker(pluginRoot)) {
      writePluginFiles(pluginRoot);
      writeMarker(pluginRoot, desired);
    }
    return;
  }

  const marker = readMarker(pluginRoot);
  const untouchedSinceLastSeed = marker
    ? matchesKnownHashes(marker, onDisk)
    : false;
  const untouchedLegacyInstall = matchesKnownHashes(
    LEGACY_MEMORY_PLUGIN_HASHES,
    onDisk
  );

  if (untouchedSinceLastSeed || untouchedLegacyInstall) {
    writePluginFiles(pluginRoot);
    writeMarker(pluginRoot, desired);
  }
}
