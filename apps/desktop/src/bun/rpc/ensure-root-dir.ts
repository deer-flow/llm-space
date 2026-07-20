import { mkdirSync } from "node:fs";
import path from "node:path";

function _resolvePathWithinHome(
  homePath: string,
  relativePath: string
): string {
  const root = path.resolve(homePath);
  const portablePath = relativePath.replaceAll("\\", "/");
  const hasParentTraversal = portablePath.split("/").includes("..");

  if (
    path.posix.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath) ||
    hasParentTraversal
  ) {
    throw new Error(`Path escapes LLM_SPACE_HOME: ${relativePath}`);
  }

  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`Path escapes LLM_SPACE_HOME: ${relativePath}`);
  }
  return target;
}

export function ensureRootDir(homePath: string, relativePath: string): string {
  const target = _resolvePathWithinHome(homePath, relativePath);
  mkdirSync(target, { recursive: true });
  return target;
}
