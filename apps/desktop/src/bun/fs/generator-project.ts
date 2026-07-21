import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Filesystem/exec backing for the code Generator, deliberately kept OUTSIDE the
 * root-confined `LocalFileSystem`: a generated project is written into a
 * user-picked directory anywhere on disk. Two guards keep this narrow:
 *
 * 1. Only directories the user explicitly picked via the native dialog
 *    (`authorizeDir`) can be written to / run in.
 * 2. The only command that can be spawned is `uv` — never an arbitrary command.
 */

/** Directories the user picked this session; only these may be written/run in. */
const _authorized = new Set<string>();

/** Files `uv init` may drop that don't count against the "empty dir" gate. */
const _IGNORED_ENTRIES = new Set([".DS_Store", ".git", ".idea", ".vscode"]);

/** Record a user-picked directory as authorized for writes + `uv` runs. */
export function authorizeGeneratorDir(dir: string): void {
  _authorized.add(path.resolve(dir));
}

function _assertAuthorized(rootDir: string): string {
  const resolved = path.resolve(rootDir);
  if (!_authorized.has(resolved)) {
    throw new Error("Directory is not authorized for project generation.");
  }
  return resolved;
}

/** Expand a leading `~` to the user's home directory. */
function _expandTilde(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "~") {
    return homedir();
  }
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(homedir(), trimmed.slice(2));
  }
  return trimmed;
}

/**
 * Resolve `parentDir/projectName`, validate it can hold a fresh project, create
 * it, and authorize it for the generator's writes + `uv` runs. This is the
 * wizard's "Next" gate on the directory step — it fails loudly (rather than
 * silently overwriting) so the user can fix the parent or name first.
 */
export async function prepareGeneratorDir(
  parentDir: string,
  projectName: string
): Promise<{ ok: true; dir: string } | { ok: false; error: string }> {
  const name = projectName.trim();
  if (!name) {
    return { ok: false, error: "Enter a project name." };
  }
  if (name === "." || name === ".." || /[/\\]/.test(name)) {
    return { ok: false, error: "Project name can't contain path separators." };
  }
  const parent = path.resolve(_expandTilde(parentDir || "~"));
  const target = path.join(parent, name);
  try {
    const parentStat = await stat(parent);
    if (!parentStat.isDirectory()) {
      return { ok: false, error: `${parent} is not a directory.` };
    }
  } catch {
    return { ok: false, error: `Parent directory doesn't exist: ${parent}` };
  }
  try {
    const targetStat = await stat(target).catch(() => null);
    if (targetStat) {
      if (!targetStat.isDirectory()) {
        return { ok: false, error: `${target} already exists as a file.` };
      }
      if (!(await isGeneratorDirEmpty(target))) {
        return {
          ok: false,
          error: `${name} already exists and isn't empty. Pick another name.`,
        };
      }
    }
    await mkdir(target, { recursive: true });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not create the directory.",
    };
  }
  authorizeGeneratorDir(target);
  return { ok: true, dir: target };
}

/** Whether `dir` has no meaningful entries (ignoring editor/OS cruft). */
export async function isGeneratorDirEmpty(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir);
    return entries.every((entry) => _IGNORED_ENTRIES.has(entry));
  } catch {
    // A missing directory is effectively empty.
    return true;
  }
}

/** Whether `uv` is on PATH, and its version string when detectable. */
export async function checkUv(): Promise<{ installed: boolean; version?: string }> {
  try {
    const proc = Bun.spawn(["uv", "--version"], {
      stdout: "pipe",
      stderr: "ignore",
      env: process.env,
    });
    const output = await new Response(proc.stdout).text();
    const code = await proc.exited;
    if (code !== 0) {
      return { installed: false };
    }
    return { installed: true, version: output.trim() || undefined };
  } catch {
    return { installed: false };
  }
}

/** Run `uv <args>` with cwd = an authorized `rootDir`. Never runs another binary. */
export async function runUv(
  rootDir: string,
  args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  const resolved = _assertAuthorized(rootDir);
  const proc = Bun.spawn(["uv", ...args], {
    cwd: resolved,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { code, stdout, stderr };
}

/** Resolve `relativePath` under an authorized `rootDir`, rejecting traversal. */
function _resolveInRoot(rootDir: string, relativePath: string): string {
  const resolved = _assertAuthorized(rootDir);
  const target = path.resolve(resolved, relativePath);
  const rel = path.relative(resolved, target);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path escapes the project root.");
  }
  return target;
}

/** Write a UTF-8 file under an authorized `rootDir`; rejects path traversal. */
export async function writeProjectFile(
  rootDir: string,
  relativePath: string,
  contents: string
): Promise<void> {
  const target = _resolveInRoot(rootDir, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
}

/** Delete a file under an authorized `rootDir`; a no-op when it's missing. */
export async function removeProjectFile(
  rootDir: string,
  relativePath: string
): Promise<void> {
  const target = _resolveInRoot(rootDir, relativePath);
  await rm(target, { force: true });
}
