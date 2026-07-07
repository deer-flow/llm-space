import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import type { BuiltinTool } from "@llm-space/core";
import { getLlmSpaceRoot } from "@llm-space/core/server";

/** Workspace root that path-less tools (e.g. `glob`) default to. */
function _workspaceRoot(): string {
  return path.join(getLlmSpaceRoot(), "workspace");
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

export const readTool: BuiltinTool = {
  type: "builtin",
  name: "read",
  icon: "file-text",
  description:
    "Reads a file from the local filesystem. Use when you need to inspect source code, config, or any text file. Returns file contents; for images, returns a visual representation. Prefer this over bash for reading files.",
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
    },
    additionalProperties: false,
  },
};

export async function read(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath);
  if (stat.isDirectory()) {
    throw new Error(`${filePath} is a directory, not a file.`);
  }
  if (IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    return `[image file: ${filePath} (${stat.size} bytes)]`;
  }
  const content = await fs.readFile(filePath, "utf8");
  return content
    .split("\n")
    .map((line, index) => `${index + 1}\t${line}`)
    .join("\n");
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
    "Performs exact string replacement in a file. The old_string must match the file contents exactly (including whitespace and indentation). Use for surgical edits; prefer write_file when replacing the entire file.",
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
  const replaced = replaceAll ? occurrences : 1;
  return `Replaced ${replaced} occurrence${replaced === 1 ? "" : "s"} in ${filePath}`;
}

// -- ls -----------------------------------------------------------------------

export const lsTool: BuiltinTool = {
  type: "builtin",
  name: "ls",
  icon: "list-tree",
  description:
    "Lists files and directories at a given path. Returns entry names sorted by modification time (newest first). Use to explore directory structure before reading or editing files.",
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
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
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

// -- grep ---------------------------------------------------------------------

export const grepTool: BuiltinTool = {
  type: "builtin",
  name: "grep",
  icon: "file-search",
  description:
    "Search file contents with ripgrep. Supports regex patterns, glob filters, and context lines. Use to find symbols, usages, or text across the codebase. Prefer this over bash grep/rg for searching.",
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
    },
    additionalProperties: false,
  },
};

export async function grep(
  pattern: string,
  searchPath: string,
  glob?: string,
  caseInsensitive = false
): Promise<string> {
  const args = ["--line-number", "--with-filename", "--color=never"];
  if (caseInsensitive) {
    args.push("--ignore-case");
  }
  if (glob) {
    args.push("--glob", glob);
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
    "Find files matching a glob pattern, sorted by modification time (newest first). Use when you need to locate files by name or extension rather than search their contents.",
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
  targetDirectory?: string
): Promise<string> {
  const root = targetDirectory ?? _workspaceRoot();
  const scanner = new Bun.Glob(globPattern);
  const matches: { path: string; mtimeMs: number }[] = [];
  for await (const relative of scanner.scan({ cwd: root, dot: true })) {
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
    },
    additionalProperties: false,
  },
};

export async function bash(command: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const { stdout, stderr, code } = await _run("bash", ["-c", command]);
  return { stdout, stderr, exitCode: code };
}

// -- registry -----------------------------------------------------------------

export const fsBuiltInTools = [
  {
    tool: readTool,
    async execute(args: Record<string, unknown>) {
      return read(_requireString(args, "path"));
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
    tool: editTool,
    async execute(args: Record<string, unknown>) {
      return edit(
        _requireString(args, "path"),
        _requireString(args, "old_string"),
        _requireString(args, "new_string"),
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
    tool: grepTool,
    async execute(args: Record<string, unknown>) {
      return grep(
        _requireString(args, "pattern"),
        _requireString(args, "path"),
        _optionalString(args, "glob"),
        _optionalBoolean(args, "case_insensitive") ?? false
      );
    },
  },
  {
    tool: globTool,
    async execute(args: Record<string, unknown>) {
      return glob(
        _requireString(args, "glob_pattern"),
        _optionalString(args, "target_directory")
      );
    },
  },
  {
    tool: bashTool,
    async execute(args: Record<string, unknown>) {
      return bash(_requireString(args, "command"));
    },
  },
];

// -- helpers ------------------------------------------------------------------

function _run(
  command: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 0 });
    });
  });
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
