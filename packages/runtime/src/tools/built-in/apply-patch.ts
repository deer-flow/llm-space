import fs from "node:fs/promises";
import path from "node:path";

import { expandHomePath } from "@llm-space/core/server";

interface AddFilePatch {
  type: "add";
  path: string;
  lines: string[];
}

interface DeleteFilePatch {
  type: "delete";
  path: string;
}

interface UpdateFilePatch {
  type: "update";
  path: string;
  moveTo?: string;
  hunks: PatchHunk[];
}

interface PatchHunk {
  changeContext?: string;
  oldLines: string[];
  newLines: string[];
  isEndOfFile: boolean;
}

type FilePatch = AddFilePatch | DeleteFilePatch | UpdateFilePatch;

const BEGIN_PATCH = "*** Begin Patch";
const END_PATCH = "*** End Patch";

/** Apply a Codex-style multi-file patch relative to the workspace root. */
export async function applyPatch(
  patchText: string,
  workspaceRoot: string
): Promise<string> {
  const patches = _parsePatch(patchText);
  const writes = new Map<string, string>();
  const deletes = new Set<string>();
  const claimedPaths = new Set<string>();
  const summaries: string[] = [];

  // Resolve and validate the entire patch before changing the filesystem.
  for (const patch of patches) {
    const sourcePath = _resolvePatchPath(patch.path, workspaceRoot);
    _claimPath(claimedPaths, sourcePath);

    if (patch.type === "add") {
      if (await _exists(sourcePath)) {
        throw new Error(`Cannot add existing file: ${sourcePath}`);
      }
      writes.set(sourcePath, `${patch.lines.join("\n")}\n`);
      summaries.push(`A ${patch.path}`);
      continue;
    }

    const original = await fs.readFile(sourcePath, "utf8");
    if (patch.type === "delete") {
      deletes.add(sourcePath);
      summaries.push(`D ${patch.path}`);
      continue;
    }

    const updated = _applyHunks(original, patch.hunks, sourcePath);
    if (patch.moveTo) {
      const destinationPath = _resolvePatchPath(patch.moveTo, workspaceRoot);
      _claimPath(claimedPaths, destinationPath);
      if (await _exists(destinationPath)) {
        throw new Error(`Cannot move to existing file: ${destinationPath}`);
      }
      writes.set(destinationPath, updated);
      deletes.add(sourcePath);
      summaries.push(`M ${patch.path} -> ${patch.moveTo}`);
    } else {
      writes.set(sourcePath, updated);
      summaries.push(`M ${patch.path}`);
    }
  }

  for (const [filePath, contents] of writes) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, contents, "utf8");
  }
  for (const filePath of deletes) {
    if (!writes.has(filePath)) {
      await fs.rm(filePath);
    }
  }

  return `Success. Updated the following files:\n${summaries.join("\n")}`;
}

function _parsePatch(patchText: string): FilePatch[] {
  if (typeof patchText !== "string" || patchText.length === 0) {
    throw new Error("patch must be a non-empty string.");
  }
  const normalized = _unwrapLenientHeredoc(patchText.replace(/\r\n/g, "\n").trim());
  const lines = normalized.endsWith("\n")
    ? normalized.slice(0, -1).split("\n")
    : normalized.split("\n");
  if (lines[0]?.trim() !== BEGIN_PATCH || lines.at(-1)?.trim() !== END_PATCH) {
    throw new Error(
      `Patch must start with "${BEGIN_PATCH}" and end with "${END_PATCH}".`
    );
  }

  const patches: FilePatch[] = [];
  let index = 1;
  if (lines[index]?.trim().startsWith("*** Environment ID: ")) {
    if (!lines[index].trim().slice("*** Environment ID: ".length).trim()) {
      throw new Error("apply_patch environment_id cannot be empty.");
    }
    index++;
  }
  while (index < lines.length - 1) {
    const header = lines[index++].trim();
    if (header.startsWith("*** Add File: ")) {
      const filePath = _requiredHeaderPath(header, "*** Add File: ");
      const added: string[] = [];
      while (index < lines.length - 1 && !_isFileHeader(lines[index])) {
        const line = lines[index++];
        if (!line.startsWith("+")) {
          throw new Error(`Add-file lines must start with "+": ${line}`);
        }
        added.push(line.slice(1));
      }
      if (added.length === 0) {
        throw new Error(`Add file hunk for path '${filePath}' is empty.`);
      }
      patches.push({ type: "add", path: filePath, lines: added });
      continue;
    }
    if (header.startsWith("*** Delete File: ")) {
      patches.push({
        type: "delete",
        path: _requiredHeaderPath(header, "*** Delete File: "),
      });
      continue;
    }
    if (header.startsWith("*** Update File: ")) {
      const filePath = _requiredHeaderPath(header, "*** Update File: ");
      let moveTo: string | undefined;
      if (lines[index]?.trim().startsWith("*** Move to: ")) {
        moveTo = _requiredHeaderPath(lines[index++].trim(), "*** Move to: ");
      }
      const hunks: PatchHunk[] = [];
      while (index < lines.length - 1 && !_isFileHeader(lines[index])) {
        if (
          lines[index].trim() === "" &&
          lines[index - 1].trim() === "*** End of File"
        ) {
          index++;
          continue;
        }
        let changeContext: string | undefined;
        if (lines[index].trim().startsWith("@@")) {
          const hunkHeader = lines[index++].trim();
          if (hunkHeader !== "@@") {
            changeContext = hunkHeader.slice(2).trim();
            if (!changeContext) {
              throw new Error(`Invalid hunk header: ${hunkHeader}`);
            }
          }
        } else if (hunks.length > 0 || !_isDiffLine(lines[index])) {
          throw new Error(`Expected a hunk header starting with "@@": ${lines[index]}`);
        }
        const oldLines: string[] = [];
        const newLines: string[] = [];
        let isEndOfFile = false;
        while (
          index < lines.length - 1 &&
          !_isFileHeader(lines[index]) &&
          !lines[index].startsWith("@@")
        ) {
          const line = lines[index++];
          if (line.trim() === "*** End of File") {
            isEndOfFile = true;
            break;
          }
          const marker = line[0];
          const content = line.slice(1);
          if (marker === " ") {
            oldLines.push(content);
            newLines.push(content);
          } else if (marker === "-") {
            oldLines.push(content);
          } else if (marker === "+") {
            newLines.push(content);
          } else {
            throw new Error(`Invalid hunk line (expected space, "+", or "-"): ${line}`);
          }
        }
        if (oldLines.length === 0 && newLines.length === 0) {
          throw new Error(`Invalid empty hunk in ${filePath}.`);
        }
        hunks.push({ changeContext, oldLines, newLines, isEndOfFile });
      }
      if (hunks.length === 0) {
        throw new Error(`Update contains no hunks: ${filePath}`);
      }
      patches.push({ type: "update", path: filePath, moveTo, hunks });
      continue;
    }
    throw new Error(`Unknown patch header: ${header}`);
  }

  if (patches.length === 0) {
    throw new Error("Patch contains no file operations.");
  }
  return patches;
}

function _applyHunks(
  original: string,
  hunks: PatchHunk[],
  filePath: string
): string {
  const lines = original.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const replacements: [number, number, string[]][] = [];
  let lineIndex = 0;

  for (const hunk of hunks) {
    if (hunk.changeContext) {
      const contextPosition = _findSequence(
        lines,
        [hunk.changeContext],
        lineIndex,
        false
      );
      if (contextPosition < 0) {
        throw new Error(
          `Failed to find context '${hunk.changeContext}' in ${filePath}`
        );
      }
      lineIndex = contextPosition + 1;
    }
    if (hunk.oldLines.length === 0) {
      replacements.push([lines.length, 0, hunk.newLines]);
      continue;
    }
    const position = _findSequence(
      lines,
      hunk.oldLines,
      lineIndex,
      hunk.isEndOfFile
    );
    if (position < 0) {
      throw new Error(
        `Failed to find expected lines in ${filePath}:\n${hunk.oldLines.join("\n")}`
      );
    }
    replacements.push([position, hunk.oldLines.length, hunk.newLines]);
    lineIndex = position + hunk.oldLines.length;
  }

  for (const [position, oldLength, newLines] of replacements.reverse()) {
    lines.splice(position, oldLength, ...newLines);
  }
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

function _findSequence(
  lines: string[],
  sequence: string[],
  start: number,
  endOfFile: boolean
): number {
  if (sequence.length === 0) return start;
  if (sequence.length > lines.length) return -1;
  const lastStart = lines.length - sequence.length;
  const searchStart = endOfFile ? Math.max(start, lastStart) : start;
  const comparators = [
    (value: string) => value,
    (value: string) => value.trimEnd(),
    (value: string) => value.trim(),
    _normalizePunctuation,
  ];
  for (const normalize of comparators) {
    for (let index = searchStart; index <= lastStart; index++) {
      if (
        sequence.every(
          (line, offset) => normalize(lines[index + offset]) === normalize(line)
        )
      ) {
        return index;
      }
    }
  }
  return -1;
}

function _normalizePunctuation(value: string): string {
  return value
    .trim()
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[\u00a0\u2002-\u200a\u202f\u205f\u3000]/g, " ");
}

function _isDiffLine(line: string): boolean {
  return line.startsWith(" ") || line.startsWith("+") || line.startsWith("-");
}

function _unwrapLenientHeredoc(value: string): string {
  const lines = value.split("\n");
  if (
    ["<<EOF", "<<'EOF'", '<<"EOF"'].includes(lines[0]) &&
    lines.at(-1)?.endsWith("EOF") &&
    lines.length >= 4
  ) {
    return lines.slice(1, -1).join("\n").trim();
  }
  return value;
}

function _isFileHeader(line: string): boolean {
  line = line.trim();
  return (
    line.startsWith("*** Add File: ") ||
    line.startsWith("*** Delete File: ") ||
    line.startsWith("*** Update File: ")
  );
}

function _requiredHeaderPath(header: string, prefix: string): string {
  const value = header.slice(prefix.length).trim();
  if (!value) throw new Error(`Missing path in patch header: ${header}`);
  return value;
}

function _resolvePatchPath(filePath: string, workspaceRoot: string): string {
  const expanded = expandHomePath(filePath);
  return path.isAbsolute(expanded)
    ? path.normalize(expanded)
    : path.resolve(workspaceRoot, expanded);
}

function _claimPath(claimed: Set<string>, filePath: string): void {
  if (claimed.has(filePath)) {
    throw new Error(`Patch references the same path more than once: ${filePath}`);
  }
  claimed.add(filePath);
}

async function _exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
