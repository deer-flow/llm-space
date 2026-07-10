import { existsSync } from "node:fs";
import path from "node:path";

import { PATHS } from "electrobun/bun";

const IS_WINDOWS = process.platform === "win32";

/**
 * The shell backing the built-in `bash` tool. On macOS/Linux this is always
 * the system `bash`. On Windows we prefer Git Bash (widely installed on
 * developer machines, keeps the tool's bash semantics intact) and fall back to
 * PowerShell — the tool description is rewritten accordingly so the model
 * writes commands in the right language (see `bashTool` in `fs.ts`).
 */
export interface ResolvedShell {
  kind: "bash" | "powershell";
  path: string;
}

function _gitBashCandidates(): string[] {
  const env = process.env;
  const candidates: string[] = [];
  // Explicit escape hatch first, so users with unusual installs can point at
  // any bash-compatible shell.
  if (env.LLM_SPACE_BASH_PATH) candidates.push(env.LLM_SPACE_BASH_PATH);
  const roots = [
    env.ProgramFiles,
    env["ProgramFiles(x86)"],
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs"),
  ];
  for (const root of roots) {
    if (root) candidates.push(path.join(root, "Git", "bin", "bash.exe"));
  }
  return candidates;
}

function _resolveShell(): ResolvedShell {
  if (!IS_WINDOWS) {
    return { kind: "bash", path: "bash" };
  }
  for (const candidate of _gitBashCandidates()) {
    if (existsSync(candidate)) return { kind: "bash", path: candidate };
  }
  const onPath = Bun.which("bash");
  // System32's bash.exe is the WSL launcher, not a shell we can hand tool
  // commands to (it errors out when WSL isn't set up).
  if (onPath && !/system32/i.test(onPath)) {
    return { kind: "bash", path: onPath };
  }
  return { kind: "powershell", path: "powershell.exe" };
}

export const shell: ResolvedShell = _resolveShell();

/** The spawn invocation that runs `command` under the resolved shell. */
export function shellInvocation(command: string): {
  command: string;
  args: string[];
} {
  if (shell.kind === "bash") {
    return { command: shell.path, args: ["-c", command] };
  }
  return {
    command: shell.path,
    args: ["-NoProfile", "-NonInteractive", "-Command", command],
  };
}

/**
 * Locate ripgrep for the built-in `grep` tool: PATH first, then the copy
 * bundled into the app's resources on Windows (see `electrobun.config.ts`
 * `build.copy` + the release workflow's download step). `null` when neither
 * exists — the tool surfaces an actionable error.
 */
export function resolveRgPath(): string | null {
  const onPath = Bun.which("rg");
  if (onPath) return onPath;
  if (IS_WINDOWS) {
    const bundled = path.join(
      PATHS.RESOURCES_FOLDER,
      "app",
      "resources",
      "rg.exe"
    );
    if (existsSync(bundled)) return bundled;
  }
  return null;
}
