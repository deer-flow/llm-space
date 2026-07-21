import { spawn } from "node:child_process";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import type { BuiltinTool } from "@llm-space/core";
import type { SkillContent } from "@llm-space/core";

import { openPath, revealInFileManager } from "../../fs";
import type { ToolEntry } from "../tool-registry";

export interface FsBuiltInToolsDependencies {
  workspaceRoot: string;
  findSkill: (name: string) => SkillContent | null;
  bashPath: string | null;
}

/**
 * Directory and file names the traversal tools (`ls`, `glob`, `grep`) skip by
 * default — dependency, version-control, build-output, and OS-cruft entries
 * that add noise without signal. `grep` feeds these to ripgrep as exclude
 * globs; `ls`/`glob` filter them out during traversal.
 */
const DEFAULT_IGNORES = [
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  ".DS_Store",
  "Thumbs.db",
  ".cache",
  ".next",
  ".nuxt",
  ".turbo",
  ".parcel-cache",
  "dist",
  "build",
  "out",
  "coverage",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".venv",
  "venv",
];

const IGNORED_NAMES = new Set(DEFAULT_IGNORES);

/** Whether a single entry name should be ignored. */
function _isIgnored(name: string): boolean {
  return IGNORED_NAMES.has(name);
}

/** Whether any segment of a relative path is an ignored name. */
function _hasIgnoredSegment(relativePath: string): boolean {
  return relativePath
    .split(/[/\\]/)
    .some((segment) => IGNORED_NAMES.has(segment));
}

// -- read ---------------------------------------------------------------------

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
  ".ico",
]);

/**
 * Upper bound on the bytes a single `read` returns. An unbounded read (no
 * `limit`) still stops here so a huge file can't blow past the model's context —
 * the output is truncated with a notice pointing at `offset`/`limit`.
 */
const READ_MAX_SIZE_BYTES = 256 * 1024;

export const readTool: BuiltinTool = {
  type: "builtin",
  name: "read",
  icon: "file-text",
  description:
    "Reads a file from the local filesystem. Use when you need to inspect source code, config, or any text file. Returns file contents with line numbers; for images, returns a text placeholder with the file's size rather than the image itself. Reads the whole file by default; pass offset/limit to read a specific line range. Output is capped at 256KB and truncated beyond that. Prefer this over bash for reading files. Do NOT use read to load a skill's SKILL.md — use the skill tool instead, unless you specifically need to edit that skill.",
  strict: true,
  parameters: {
    type: "object",
    required: ["description", "path"],
    properties: {
      description: {
        type: "string",
        description:
          "Must be the first parameter in the tool call. A short human-readable summary explaining why this file is being read",
      },
      path: {
        type: "string",
        description: "Absolute path to the file to read",
      },
      offset: {
        type: "number",
        description:
          "1-based line number to start reading from. Defaults to 1 (the first line).",
      },
      limit: {
        type: "number",
        description:
          "Maximum number of lines to read from offset. Defaults to unlimited (the rest of the file), still capped by the 256KB output limit.",
      },
    },
    additionalProperties: false,
  },
};

export async function read(
  filePath: string,
  offset?: number,
  limit?: number
): Promise<string> {
  const stat = await fs.stat(filePath);
  if (stat.isDirectory()) {
    throw new Error(`${filePath} is a directory, not a file.`);
  }
  if (IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    return `[image file: ${filePath} (${stat.size} bytes)]`;
  }
  const content = await fs.readFile(filePath, "utf8");
  const lines = content.split("\n");

  const start = offset && offset > 1 ? offset - 1 : 0;
  const end = limit !== undefined ? start + Math.max(0, limit) : lines.length;
  const selected = lines.slice(start, Math.max(start, end));

  // Number lines by their real position and stop once the output would exceed
  // the size cap, so an unbounded read stays bounded.
  const out: string[] = [];
  let bytes = 0;
  let truncated = false;
  for (let i = 0; i < selected.length; i++) {
    const rendered = `${start + i + 1}\t${selected[i]}`;
    const size = Buffer.byteLength(rendered, "utf8") + 1; // + newline
    if (out.length > 0 && bytes + size > READ_MAX_SIZE_BYTES) {
      truncated = true;
      break;
    }
    bytes += size;
    out.push(rendered);
  }

  let result = out.join("\n");
  if (truncated) {
    result += `\n... [truncated at ${READ_MAX_SIZE_BYTES} bytes; pass offset/limit to read a specific range]`;
  }
  return result;
}

// -- write --------------------------------------------------------------------

export const writeTool: BuiltinTool = {
  type: "builtin",
  name: "write",
  icon: "file-output",
  description:
    "Writes content to a file on the local filesystem, creating parent directories if needed. Overwrites the file if it already exists. Use for creating new files or fully replacing file contents.",
  strict: true,
  parameters: {
    type: "object",
    required: ["description", "path", "contents"],
    properties: {
      description: {
        type: "string",
        description:
          "Must be the first parameter in the tool call. A short human-readable summary explaining what is being written and why",
      },
      path: {
        type: "string",
        description: "Absolute path to the file to write",
      },
      contents: {
        type: "string",
        description: "The full text content to write to the file",
      },
    },
    additionalProperties: false,
  },
};

export async function write(
  filePath: string,
  contents: string
): Promise<string> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, "utf8");
  return `Wrote ${Buffer.byteLength(contents, "utf8")} bytes to ${filePath}`;
}

// -- edit ---------------------------------------------------------------------

export const editTool: BuiltinTool = {
  type: "builtin",
  name: "edit",
  icon: "pencil",
  description:
    "Performs an exact string replacement in a file. old_string must match the file contents exactly (including whitespace and indentation) and be unique unless replace_all is set. Use for surgical edits; prefer write when replacing the entire file.",
  strict: true,
  parameters: {
    type: "object",
    required: ["description", "path", "old_string", "new_string"],
    properties: {
      description: {
        type: "string",
        description:
          "Must be the first parameter in the tool call. A short human-readable summary explaining the edit being made",
      },
      path: {
        type: "string",
        description: "Absolute path to the file to edit",
      },
      old_string: {
        type: "string",
        description:
          "The exact text to replace (must be unique within the file unless replace_all is true)",
      },
      new_string: {
        type: "string",
        description: "The replacement text (must differ from old_string)",
      },
      replace_all: {
        type: "boolean",
        description:
          "Replace all occurrences of old_string. Defaults to false (first match only).",
      },
    },
    additionalProperties: false,
  },
};

export async function edit(
  filePath: string,
  oldString: string,
  newString: string,
  replaceAll = false
): Promise<string> {
  if (oldString === newString) {
    throw new Error("new_string must differ from old_string.");
  }
  const content = await fs.readFile(filePath, "utf8");
  const occurrences = content.split(oldString).length - 1;
  if (occurrences === 0) {
    throw new Error("old_string was not found in the file.");
  }
  if (!replaceAll && occurrences > 1) {
    throw new Error(
      `old_string is not unique (${occurrences} matches). Provide a larger unique string or set replace_all.`
    );
  }
  const updated = replaceAll
    ? content.split(oldString).join(newString)
    : content.replace(oldString, newString);
  await fs.writeFile(filePath, updated, "utf8");
  const totalReplaced = replaceAll ? occurrences : 1;
  return `Replaced ${totalReplaced} occurrence${totalReplaced === 1 ? "" : "s"} in ${filePath}`;
}

// -- ls -----------------------------------------------------------------------

export const lsTool: BuiltinTool = {
  type: "builtin",
  name: "ls",
  icon: "list-tree",
  description:
    "Lists files and directories at a given path. Returns entry names sorted by modification time (newest first). Common noise directories (node_modules, .git, build output, etc.) are omitted. Use to explore directory structure before reading or editing files.",
  strict: true,
  parameters: {
    type: "object",
    required: ["description", "path"],
    properties: {
      description: {
        type: "string",
        description:
          "Must be the first parameter in the tool call. A short human-readable summary explaining why this directory is being listed",
      },
      path: {
        type: "string",
        description: "Absolute path to the directory to list",
      },
    },
    additionalProperties: false,
  },
};

export async function ls(dirPath: string): Promise<string> {
  const entries = (await fs.readdir(dirPath, { withFileTypes: true })).filter(
    (entry) => !_isIgnored(entry.name)
  );
  const withMtime = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dirPath, entry.name);
      let mtimeMs = 0;
      try {
        mtimeMs = (await fs.stat(full)).mtimeMs;
      } catch {
        // Broken symlink or race — keep it at the bottom.
      }
      return {
        name: entry.isDirectory() ? `${entry.name}/` : entry.name,
        mtimeMs,
      };
    })
  );
  if (withMtime.length === 0) {
    return `${dirPath} is empty.`;
  }
  return withMtime
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map((entry) => entry.name)
    .join("\n");
}

// -- tree ---------------------------------------------------------------------

/** Default and safety-cap depths for `tree`. */
const TREE_DEFAULT_DEPTH = 5;
const TREE_MAX_DEPTH = 20;

export const treeTool: BuiltinTool = {
  type: "builtin",
  name: "tree",
  icon: "folder-tree",
  description:
    "Prints a directory as an indented tree up to a maximum depth (default 5 levels). Common noise directories (node_modules, .git, build output, etc.) are skipped. Use to understand a project's layout at a glance before reading individual files.",
  strict: true,
  parameters: {
    type: "object",
    required: ["description", "path"],
    properties: {
      description: {
        type: "string",
        description:
          "Must be the first parameter in the tool call. A short human-readable summary explaining why this tree is being generated",
      },
      path: {
        type: "string",
        description: "Absolute path to the directory to print as a tree",
      },
      max_depth: {
        type: "number",
        description: `Maximum directory depth to descend. Defaults to ${TREE_DEFAULT_DEPTH}, capped at ${TREE_MAX_DEPTH}.`,
      },
    },
    additionalProperties: false,
  },
};

export async function tree(
  dirPath: string,
  maxDepth?: number
): Promise<string> {
  const stat = await fs.stat(dirPath);
  if (!stat.isDirectory()) {
    throw new Error(`${dirPath} is not a directory.`);
  }
  const depth =
    maxDepth !== undefined && maxDepth > 0
      ? Math.min(Math.floor(maxDepth), TREE_MAX_DEPTH)
      : TREE_DEFAULT_DEPTH;

  const lines = [dirPath];
  await _buildTree(dirPath, "", depth, lines);
  if (lines.length === 1) {
    return `${dirPath} is empty.`;
  }
  return lines.join("\n");
}

/**
 * Append a directory's children to `lines` as tree rows, recursing up to
 * `remaining` more levels. Directories sort before files, ignored names are
 * skipped, and symlinks are not descended into (avoiding loops).
 */
async function _buildTree(
  dir: string,
  prefix: string,
  remaining: number,
  lines: string[]
): Promise<void> {
  if (remaining <= 0) {
    return;
  }
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    // Unreadable directory (permissions, race) — render it as a leaf.
    return;
  }
  const visible = entries
    .filter((entry) => !_isIgnored(entry.name))
    .sort((a, b) => {
      const aDir = a.isDirectory() ? 0 : 1;
      const bDir = b.isDirectory() ? 0 : 1;
      return aDir - bDir || a.name.localeCompare(b.name);
    });

  for (let i = 0; i < visible.length; i++) {
    const entry = visible[i];
    const last = i === visible.length - 1;
    const isDir = entry.isDirectory();
    lines.push(
      `${prefix}${last ? "└── " : "├── "}${entry.name}${isDir ? "/" : ""}`
    );
    if (isDir) {
      await _buildTree(
        path.join(dir, entry.name),
        `${prefix}${last ? "    " : "│   "}`,
        remaining - 1,
        lines
      );
    }
  }
}

// -- grep ---------------------------------------------------------------------

export const grepTool: BuiltinTool = {
  type: "builtin",
  name: "grep",
  icon: "file-search",
  description:
    "Search file contents with ripgrep. Supports regex patterns, glob filters, case-insensitive matching, and surrounding context lines. Common noise directories (node_modules, .git, build output, etc.) are excluded. Use to find symbols, usages, or text across the codebase. Prefer this over bash grep/rg for searching.",
  strict: true,
  parameters: {
    type: "object",
    required: ["description", "pattern", "path"],
    properties: {
      description: {
        type: "string",
        description:
          "Must be the first parameter in the tool call. A short human-readable summary explaining what is being searched for",
      },
      pattern: {
        type: "string",
        description:
          "Regular expression pattern to search for in file contents",
      },
      path: {
        type: "string",
        description: "Absolute path to a file or directory to search in",
      },
      glob: {
        type: "string",
        description:
          'Glob filter for files (e.g. "*.ts", "**/*.tsx") — maps to rg --glob',
      },
      case_insensitive: {
        type: "boolean",
        description: "Case insensitive search",
      },
      context_lines: {
        type: "number",
        description:
          "Number of context lines to show before and after each match (maps to rg -C). Defaults to 0.",
      },
    },
    additionalProperties: false,
  },
};

export async function grep(
  pattern: string,
  searchPath: string,
  glob?: string,
  caseInsensitive = false,
  contextLines?: number
): Promise<string> {
  const args = ["--line-number", "--with-filename", "--color=never"];
  // Prune common noise dirs/files regardless of any .gitignore presence.
  for (const name of DEFAULT_IGNORES) {
    args.push("--glob", `!${name}`);
  }
  if (caseInsensitive) {
    args.push("--ignore-case");
  }
  if (glob) {
    args.push("--glob", glob);
  }
  if (contextLines !== undefined && contextLines > 0) {
    args.push("--context", String(Math.floor(contextLines)));
  }
  args.push("--regexp", pattern, "--", searchPath);

  const { stdout, stderr, code } = await _run("rg", args);
  if (code === 1) {
    return "No matches found.";
  }
  if (code !== 0) {
    throw new Error(stderr.trim() || `grep failed with exit code ${code}.`);
  }
  return stdout.trimEnd();
}

// -- glob ---------------------------------------------------------------------

export const globTool: BuiltinTool = {
  type: "builtin",
  name: "glob",
  icon: "folder-search",
  description:
    "Find files matching a glob pattern, sorted by modification time (newest first). Common noise directories (node_modules, .git, build output, etc.) are skipped. Use when you need to locate files by name or extension rather than search their contents.",
  strict: true,
  parameters: {
    type: "object",
    required: ["description", "glob_pattern"],
    properties: {
      description: {
        type: "string",
        description:
          "Must be the first parameter in the tool call. A short human-readable summary explaining what files are being searched for",
      },
      glob_pattern: {
        type: "string",
        description: 'Glob pattern to match (e.g. "*.ts", "**/test_*.ts")',
      },
      target_directory: {
        type: "string",
        description:
          "Absolute path to the directory to search in. Defaults to the workspace root if omitted.",
      },
    },
    additionalProperties: false,
  },
};

export async function glob(
  globPattern: string,
  targetDirectory: string | undefined,
  workspaceRoot: string
): Promise<string> {
  const root = targetDirectory ?? workspaceRoot;
  const scanner = new Bun.Glob(globPattern);
  const matches: { path: string; mtimeMs: number }[] = [];
  for await (const relative of scanner.scan({ cwd: root, dot: true })) {
    if (_hasIgnoredSegment(relative)) {
      continue;
    }
    const full = path.join(root, relative);
    try {
      matches.push({ path: full, mtimeMs: (await fs.stat(full)).mtimeMs });
    } catch {
      // File vanished between scan and stat — skip it.
    }
  }
  if (matches.length === 0) {
    return "No files matched.";
  }
  return matches
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map((match) => match.path)
    .join("\n");
}

// -- bash ---------------------------------------------------------------------

export const bashTool: BuiltinTool = {
  type: "builtin",
  name: "bash",
  icon: "terminal",
  description:
    "Executes a bash command and returns stdout, stderr, and exit code. Each invocation runs in a fresh shell — cwd, exported variables, and other shell state do not persist. Every command must be self-contained: re-cd to the target directory, re-export env vars, and re-source files as needed on every call.",
  strict: true,
  parameters: {
    type: "object",
    required: ["description", "command"],
    properties: {
      description: {
        type: "string",
        description:
          "Must be the first parameter in the tool call. A short human-readable summary explaining the purpose of the command",
      },
      command: {
        type: "string",
        description:
          "The bash command to execute. Must be self-contained — include cd, export, and any other setup inline, because prior invocations leave no lasting shell state.",
      },
      timeout: {
        type: "number",
        description:
          "Timeout in milliseconds (max 600000ms, 120000ms by default).",
      },
    },
    additionalProperties: false,
  },
};

const BASH_DEFAULT_TIMEOUT_MS = 120_000;
const BASH_MAX_TIMEOUT_MS = 600_000;

export async function bash(
  command: string,
  timeout: number | undefined,
  bashPath: string | null,
  runCommand: (
    command: string,
    args: string[],
    timeoutMs?: number
  ) => Promise<{ stdout: string; stderr: string; code: number }> = _run
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  if (!bashPath) {
    throw new Error(
      "Bash is unavailable on this system. Install Bash (Git for Windows includes Git Bash) and add it to PATH; the structured file tools remain available."
    );
  }
  const timeoutMs = Math.min(
    timeout ?? BASH_DEFAULT_TIMEOUT_MS,
    BASH_MAX_TIMEOUT_MS
  );
  const { stdout, stderr, code } = await runCommand(
    bashPath,
    ["-c", command],
    timeoutMs
  );
  return { stdout, stderr, exitCode: code };
}

// -- skill --------------------------------------------------------------------

export const skillTool: BuiltinTool = {
  type: "builtin",
  name: "skill",
  icon: "sparkles",
  description:
    "Load a skill within the main conversation. When users ask you to perform tasks, check if any of the available skills match. Skills provide specialized capabilities and domain knowledge. Prefer this over read for loading a skill's instructions.",
  strict: true,
  parameters: {
    type: "object",
    required: ["name"],
    properties: {
      name: {
        type: "string",
        description: "The name of the skill to load (its SKILL.md `name`).",
      },
    },
    additionalProperties: false,
  },
};

export function skill(
  name: string,
  findSkill: FsBuiltInToolsDependencies["findSkill"]
): string {
  const found = findSkill(name);
  if (!found) {
    throw new Error(`Skill "${name}" not found.`);
  }
  return `Base directory for this skill: ${found.path}\n\n${found.content.trim()}`;
}

// -- present_files ------------------------------------------------------------

export const presentFilesTool: BuiltinTool = {
  type: "builtin",
  name: "present_files",
  icon: "files",
  description:
    'You should always use this tool to present the artifacts and foundings after each creation or edit. Other wise the user won\'t be able to "see" them. Use when delivering final artifacts, reports, charts, or other outputs the user should see or download.',
  strict: true,
  parameters: {
    type: "object",
    required: ["description", "paths"],
    properties: {
      description: {
        type: "string",
        description:
          "Must be the first parameter in the tool call. A short human-readable summary explaining what files are being presented and why",
      },
      paths: {
        type: "array",
        items: {
          type: "string",
        },
        description: "Absolute paths to the files to present to the user",
      },
    },
    additionalProperties: false,
  },
};

/**
 * Present files to the user. HTML files are opened directly with the OS default
 * handler (so a generated page renders in the browser); everything else is
 * revealed in the file manager (Finder on macOS, Explorer on Windows, the
 * enclosing folder on Linux) — the same reveal used by the tree-view "Reveal in
 * Finder" action.
 */
export async function present_files(paths: string[]): Promise<"OK"> {
  const reveals: Promise<void>[] = [];
  for (const p of paths) {
    if (_isHtmlFile(p)) {
      openPath(p);
    } else {
      reveals.push(revealInFileManager(p));
    }
  }
  await Promise.all(reveals);
  return "OK";
}

function _isHtmlFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".html" || ext === ".htm";
}

// -- registry -----------------------------------------------------------------

export function createFsBuiltInTools({
  workspaceRoot,
  findSkill,
  bashPath,
}: FsBuiltInToolsDependencies): ToolEntry[] {
  return [
    {
      tool: readTool,
      async execute(args: Record<string, unknown>) {
        return read(
          _requireString(args, "path"),
          _optionalNumber(args, "offset"),
          _optionalNumber(args, "limit")
        );
      },
    },
    {
      tool: writeTool,
      async execute(args: Record<string, unknown>) {
        return write(
          _requireString(args, "path"),
          _requireString(args, "contents")
        );
      },
    },
    {
      tool: skillTool,
      execute(args: Record<string, unknown>) {
        return Promise.resolve(skill(_requireString(args, "name"), findSkill));
      },
    },
    {
      tool: editTool,
      async execute(args: Record<string, unknown>) {
        return edit(
          _requireString(args, "path"),
          _requireString(args, "old_string"),
          _requireStringAllowEmpty(args, "new_string"),
          _optionalBoolean(args, "replace_all") ?? false
        );
      },
    },
    {
      tool: lsTool,
      async execute(args: Record<string, unknown>) {
        return ls(_requireString(args, "path"));
      },
    },
    {
      tool: treeTool,
      async execute(args: Record<string, unknown>) {
        return tree(
          _requireString(args, "path"),
          _optionalNumber(args, "max_depth")
        );
      },
    },
    {
      tool: grepTool,
      async execute(args: Record<string, unknown>) {
        return grep(
          _requireString(args, "pattern"),
          _requireString(args, "path"),
          _optionalString(args, "glob"),
          _optionalBoolean(args, "case_insensitive") ?? false,
          _optionalNumber(args, "context_lines")
        );
      },
    },
    {
      tool: globTool,
      async execute(args: Record<string, unknown>) {
        return glob(
          _requireString(args, "glob_pattern"),
          _optionalString(args, "target_directory"),
          workspaceRoot
        );
      },
    },
    ...(bashPath
      ? [
          {
            tool: bashTool,
            async execute(args: Record<string, unknown>) {
              return bash(
                _requireString(args, "command"),
                _optionalNumber(args, "timeout"),
                bashPath
              );
            },
          },
        ]
      : []),
    {
      tool: presentFilesTool,
      async execute(args: Record<string, unknown>) {
        return present_files(_requireStringArray(args, "paths"));
      },
    },
  ];
}

// -- helpers ------------------------------------------------------------------

function _run(
  command: string,
  args: string[],
  timeoutMs?: number
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
        return;
      }
      resolve({ stdout, stderr, code: code ?? 0 });
    });
  });
}

/** Read a string that may be empty (e.g. `new_string` when deleting text). */
function _requireStringAllowEmpty(
  args: Record<string, unknown>,
  key: string
): string {
  const value = args[key];
  if (typeof value !== "string") {
    throw new Error(`${key} must be a string.`);
  }
  return value;
}

/** Read a non-empty array of strings from `args`, rejecting other shapes. */
function _requireStringArray(
  args: Record<string, unknown>,
  key: string
): string[] {
  const value = args[key];
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((item): item is string => typeof item === "string")
  ) {
    throw new Error(`${key} must be a non-empty array of strings.`);
  }
  return value;
}

function _requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function _optionalString(
  args: Record<string, unknown>,
  key: string
): string | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${key} must be a string.`);
  }
  return value;
}

function _optionalBoolean(
  args: Record<string, unknown>,
  key: string
): boolean | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${key} must be a boolean.`);
  }
  return value;
}

function _optionalNumber(
  args: Record<string, unknown>,
  key: string
): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} must be a number.`);
  }
  return value;
}
