import type { SharedThreadSource } from "../types/storage/connector";
import type { FileSystem } from "../types/storage/file-system";
import type { ThreadStorage } from "../types/storage/thread-storage";

const DEFAULT_DIR = "shared";
const FALLBACK_STEM = "shared-thread";
const THREAD_EXT = ".json";
// Characters that are illegal in file names on common filesystems.
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*]/g;

export interface ImportSharedThreadOptions {
  /** Workspace-relative directory to import into. Default `"shared"`. */
  dir?: string;
  /** Recorded as `thread.originalURL` for provenance (typically the deep link). */
  originalUrl?: string;
  /** Aborts the underlying read; on abort nothing is written. */
  signal?: AbortSignal;
}

export interface ImportedThread {
  /** Workspace-relative path the thread was written to, e.g. `shared/foo.json`. */
  path: string;
  title?: string;
}

/**
 * Read a shared thread from `source` and write it into `dest` under `dir`,
 * naming the file after the thread title (sanitized) and deduping collisions
 * with a `-<n>` suffix (`foo.json` → `foo-1.json` → `foo-2.json` …). Sets
 * `originalURL` on the imported thread when `options.originalUrl` is given.
 */
export async function importSharedThread(
  source: SharedThreadSource,
  threadId: string,
  dest: FileSystem & ThreadStorage,
  options: ImportSharedThreadOptions = {}
): Promise<ImportedThread> {
  const dir = options.dir ?? DEFAULT_DIR;
  const { thread, meta } = await source.readShared(threadId, {
    signal: options.signal,
  });

  const stem =
    _sanitizeStem(meta.title) ??
    _sanitizeStem(_stripExt(meta.filename)) ??
    FALLBACK_STEM;
  const existing = await _existingNames(dest, dir);
  const filename = _uniqueName(existing, stem);
  const path = `${dir}/${filename}`;

  const toWrite = options.originalUrl
    ? { ...thread, originalURL: options.originalUrl }
    : thread;
  await dest.write(path, toWrite);
  return { path, title: thread.title };
}

/** Existing file/dir names in `dir`; empty when the directory doesn't exist yet. */
async function _existingNames(
  dest: FileSystem,
  dir: string
): Promise<Set<string>> {
  try {
    const nodes = await dest.ls(dir);
    return new Set(nodes.map((n) => n.name));
  } catch {
    return new Set();
  }
}

/** `stem.json`, then `stem-1.json`, `stem-2.json`, … within `existing`. */
function _uniqueName(existing: Set<string>, stem: string): string {
  const first = `${stem}${THREAD_EXT}`;
  if (!existing.has(first)) return first;
  let n = 1;
  while (existing.has(`${stem}-${n}${THREAD_EXT}`)) n++;
  return `${stem}-${n}${THREAD_EXT}`;
}

/** Sanitize a title into a safe filename stem, or null if nothing usable remains. */
function _sanitizeStem(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(ILLEGAL_FILENAME_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    // No trailing dot/space (illegal on Windows).
    .replace(/[. ]+$/, "");
  return cleaned.length > 0 ? cleaned.slice(0, 120) : null;
}

function _stripExt(name: string | undefined): string | undefined {
  if (!name) return undefined;
  return name.endsWith(THREAD_EXT) ? name.slice(0, -THREAD_EXT.length) : name;
}
