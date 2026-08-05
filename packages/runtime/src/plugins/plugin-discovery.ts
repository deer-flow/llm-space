import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import path from "node:path";

import { z } from "zod";

import { PluginLogger } from "./plugin-logger";
import type { DiscoveredPlugin, PluginDiscoveryFailure } from "./plugin-types";

const PackageSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  displayName: z.string().min(1).optional(),
  description: z.string().optional(),
  author: z
    .union([z.string(), z.object({ name: z.string().optional() })])
    .optional(),
  license: z.string().optional(),
  homepage: z.string().optional(),
  engines: z.object({ "llm-space": z.string().min(1) }),
});
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const SEMVER_VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const EXTENSION_FILE_PATTERN = /\.(?:ts|js|mjs)$/;
const MAX_ICON_BYTES = 2 * 1024 * 1024;
const MAX_ICON_DIMENSION = 4096;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

export interface PluginDiscoveryResult {
  plugins: DiscoveredPlugin[];
  failures: PluginDiscoveryFailure[];
}

export function discoverPlugins({
  pluginsPath,
  appVersion,
  logger,
}: {
  pluginsPath: string;
  appVersion: string;
  logger: PluginLogger;
}): PluginDiscoveryResult {
  const plugins: DiscoveredPlugin[] = [];
  const failures: PluginDiscoveryFailure[] = [];
  const roots = _candidateRoots(pluginsPath);

  for (const rootPath of roots) {
    const candidateId = path
      .relative(pluginsPath, rootPath)
      .split(path.sep)
      .join("/");
    try {
      _assertRealDirectory(rootPath, pluginsPath);
      const packagePath = _realFile(rootPath, "package.json");
      if (!packagePath) throw new Error("package.json is required.");
      const metadata = PackageSchema.parse(
        JSON.parse(readFileSync(packagePath, "utf8"))
      );
      if (!PACKAGE_NAME.test(metadata.name)) {
        throw new Error(`Invalid npm package name: ${metadata.name}`);
      }
      if (metadata.name !== candidateId) {
        throw new Error(
          `Package name ${metadata.name} does not match directory ${candidateId}.`
        );
      }
      if (!SEMVER_VERSION.test(metadata.version)) {
        throw new Error(`Invalid plugin version: ${metadata.version}`);
      }
      const compatible = Bun.semver.satisfies(
        appVersion,
        metadata.engines["llm-space"]
      );
      const icon = _readIcon(rootPath);
      plugins.push({
        id: metadata.name,
        rootPath,
        metadata,
        compatible,
        ...icon,
        skillPaths: _discoverSkills(rootPath),
        mcpPath: _realFile(rootPath, "mcp.json"),
        modelsPath: _realFile(rootPath, "models.json"),
        commandPaths: _extensionFiles(rootPath, "commands"),
        toolPaths: _extensionFiles(rootPath, "tools"),
        threadStoragePaths: _extensionFiles(rootPath, "thread-storages"),
        settingsSchemaPath: _realFile(rootPath, "config.schema.json"),
      });
    } catch (error) {
      failures.push({
        id: candidateId,
        rootPath,
        error: logger.writeError({
          pluginId: candidateId || undefined,
          stage: "discovery",
          error,
        }),
      });
    }
  }

  const duplicateIds = new Set<string>();
  const counts = new Map<string, number>();
  for (const plugin of plugins)
    counts.set(plugin.id, (counts.get(plugin.id) ?? 0) + 1);
  for (const [id, count] of counts) if (count > 1) duplicateIds.add(id);
  if (duplicateIds.size > 0) {
    for (const plugin of plugins.filter((item) => duplicateIds.has(item.id))) {
      failures.push({
        id: plugin.id,
        rootPath: plugin.rootPath,
        error: logger.writeError({
          pluginId: plugin.id,
          pluginVersion: plugin.metadata.version,
          stage: "discovery",
          error: new Error(`Duplicate plugin id: ${plugin.id}`),
        }),
      });
    }
  }
  return {
    plugins: plugins.filter((plugin) => !duplicateIds.has(plugin.id)),
    failures,
  };
}

function _candidateRoots(pluginsPath: string): string[] {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(pluginsPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const result: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;
    const first = path.join(pluginsPath, entry.name);
    if (entry.isSymbolicLink()) {
      if (existsSync(path.join(first, "package.json"))) result.push(first);
      continue;
    }
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith("@")) {
      if (existsSync(path.join(first, "package.json"))) result.push(first);
      continue;
    }
    for (const scoped of readdirSync(first, { withFileTypes: true })) {
      if (
        scoped.name !== "node_modules" &&
        scoped.isDirectory() &&
        !scoped.isSymbolicLink() &&
        existsSync(path.join(first, scoped.name, "package.json"))
      ) {
        result.push(path.join(first, scoped.name));
      }
    }
  }
  return result.sort();
}

function _assertRealDirectory(rootPath: string, pluginsPath: string): void {
  if (
    !lstatSync(rootPath).isDirectory() ||
    lstatSync(rootPath).isSymbolicLink()
  ) {
    throw new Error("Plugin roots must be real directories.");
  }
  const root = realpathSync(rootPath);
  const base = realpathSync(pluginsPath);
  if (!root.startsWith(`${base}${path.sep}`))
    throw new Error("Plugin path escapes plugins directory.");
}

function _realFile(rootPath: string, relative: string): string | undefined {
  const filePath = path.join(rootPath, relative);
  if (!existsSync(filePath)) return undefined;
  const stat = lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${relative} must be a regular file.`);
  }
  return filePath;
}

function _readIcon(rootPath: string): {
  iconPath?: string;
  iconDataUrl?: string;
} {
  const iconPath = _realFile(rootPath, "icon.png");
  if (!iconPath) return {};
  const bytes = readFileSync(iconPath);
  if (
    bytes.length < 24 ||
    bytes.length > MAX_ICON_BYTES ||
    !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
  ) {
    return {};
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (
    width === 0 ||
    height === 0 ||
    width > MAX_ICON_DIMENSION ||
    height > MAX_ICON_DIMENSION
  ) {
    return {};
  }
  return {
    iconPath,
    iconDataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
  };
}

function _discoverSkills(rootPath: string): string[] {
  const skillsPath = path.join(rootPath, "skills");
  if (existsSync(skillsPath)) {
    const stat = lstatSync(skillsPath);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error("skills must be a regular directory.");
    }
  }
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(skillsPath, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.isSymbolicLink() &&
        _isRegularFile(path.join(skillsPath, entry.name, "SKILL.md"))
    )
    .map((entry) => path.join(skillsPath, entry.name));
}

function _extensionFiles(rootPath: string, directory: string): string[] {
  const extensionPath = path.join(rootPath, directory);
  if (existsSync(extensionPath)) {
    const stat = lstatSync(extensionPath);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`${directory} must be a regular directory.`);
    }
  }
  try {
    return readdirSync(extensionPath, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          !entry.isSymbolicLink() &&
          EXTENSION_FILE_PATTERN.test(entry.name)
      )
      .map((entry) => path.join(extensionPath, entry.name))
      .sort();
  } catch {
    return [];
  }
}

function _isRegularFile(filePath: string): boolean {
  try {
    const stat = lstatSync(filePath);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}
