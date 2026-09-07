import { normalizeThread, type Thread } from "@llm-space/core";
import { validateThreadFileStem } from "@llm-space/core/thread";

export {
  validateThreadFileStem,
  type FileStemValidationResult,
} from "@llm-space/core/thread";

const THREAD_FILE_EXTENSION = ".json";

export function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

export function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

export function ensureJson(name: string): string {
  return name.endsWith(THREAD_FILE_EXTENSION)
    ? name
    : `${name}${THREAD_FILE_EXTENSION}`;
}

export function threadFileNameFromTitle(title: string): string {
  return `${title.trim()}${THREAD_FILE_EXTENSION}`;
}

export function stripThreadExtension(name: string): string {
  return name.endsWith(THREAD_FILE_EXTENSION)
    ? name.slice(0, -THREAD_FILE_EXTENSION.length)
    : name;
}

export function threadTitleFromPath(path: string): string {
  return stripThreadExtension(basename(path));
}

export function normalizeThreadForPath(thread: Thread, path: string): Thread {
  const normalizedThread = normalizeThread(thread);
  const title = threadTitleFromPath(path);
  return normalizedThread.title === title
    ? normalizedThread
    : { ...normalizedThread, title };
}

export function threadPathForTitle(currentPath: string, title: string): string {
  return joinPath(parentOf(currentPath), threadFileNameFromTitle(title));
}

/**
 * Pick the next sibling path for a compacted clone. Re-compacting
 * `task-compact-2.json` continues the original sequence as
 * `task-compact-3.json` instead of nesting another suffix.
 */
export function nextCompactedThreadPath(
  currentPath: string,
  existingNames: Set<string>
): string {
  const currentStem = stripThreadExtension(basename(currentPath));
  const baseStem = currentStem.replace(/-compact-\d+$/, "");
  const prefix = `${baseStem}-compact-`;
  let highestNumber = 0;
  for (const name of existingNames) {
    if (!name.startsWith(prefix) || !name.endsWith(THREAD_FILE_EXTENSION)) {
      continue;
    }
    const rawNumber = name.slice(prefix.length, -THREAD_FILE_EXTENSION.length);
    if (!/^\d+$/.test(rawNumber)) continue;
    highestNumber = Math.max(highestNumber, Number(rawNumber));
  }
  const currentNumber = Number((/-compact-(\d+)$/.exec(currentStem))?.[1] ?? 0);
  const number = Math.max(highestNumber, currentNumber) + 1;
  return joinPath(
    parentOf(currentPath),
    `${baseStem}-compact-${number}${THREAD_FILE_EXTENSION}`
  );
}

/**
 * A collision-free `.json` file name for `stem` within a directory whose
 * existing names are `existing`: `stem.json`, then `stem-1.json`,
 * `stem-2.json`, … (mirrors the tree's `untitled` / `untitled-1` scheme, but
 * with a caller-supplied stem — used when importing files).
 */
export function uniqueThreadFileName(
  existing: Set<string>,
  stem: string
): string {
  const first = ensureJson(stem);
  if (!existing.has(first)) return first;
  let n = 1;
  while (existing.has(`${stem}-${n}${THREAD_FILE_EXTENSION}`)) n++;
  return `${stem}-${n}${THREAD_FILE_EXTENSION}`;
}

/**
 * Derive a thread-file stem from an imported file's name: the basename minus
 * its final extension, if it is a valid file stem; otherwise `"untitled"`.
 */
export function importStemFromFileName(fileName: string): string {
  const stem = basename(fileName).replace(/\.[^.]+$/, "");
  return validateThreadFileStem(stem).valid ? stem.trim() : "untitled";
}
