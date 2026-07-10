import { existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Resolve a user-provided path to its canonical absolute path.
 */
export function realpath(inputPath: string): string {
  return realpathSync(path.resolve(inputPath));
}

/**
 * Return the directory path only when it already exists.
 */
export function existingDirectory(dir: string): string | undefined {
  return existsSync(dir) && statSync(dir).isDirectory() ? dir : undefined;
}

/**
 * Find the first existing path from an ordered list of candidates.
 */
export function findFirstExisting(paths: readonly string[]): string | undefined {
  return paths.find((candidate) => existsSync(candidate));
}

/**
 * Convert a local module path to a cache-busted file URL for direct TS import.
 */
export function moduleUrl(filePath: string): string {
  const url = pathToFileURL(filePath);
  const mtime = statSync(filePath).mtimeMs;
  url.searchParams.set("mtime", String(mtime));
  return url.href;
}

/**
 * Resolve a candidate path and reject it if it escapes the given root.
 */
export function resolveInside(root: string, candidate: string): string {
  const resolvedRoot = realpath(root);
  const resolved = realpathSync(path.resolve(candidate));
  if (
    resolved !== resolvedRoot &&
    !resolved.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error(`Path escapes Eve project boundary: ${candidate}`);
  }
  return resolved;
}
