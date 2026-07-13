import type { ImageDataContent, Thread } from "../../../types";

import type { BlobStore } from "./blob-store";

/**
 * Sentinel prefix marking an `image_data.data` string as a blob reference
 * rather than inline base64. The colon guarantees it can never collide with
 * real base64 (whose alphabet excludes `:`), so the two are unambiguous.
 */
const BLOB_REF_PREFIX = "blob:sha256:";

/**
 * Minimum inline base64 length (characters) before an image is offloaded to the
 * blob store. Below this the per-blob overhead (a separate sharded file) isn't
 * worth it; above it de-duplication across run-history snapshots pays for
 * itself many times over.
 */
const MIN_OFFLOAD_LENGTH = 1024;

function _isImageData(value: unknown): value is ImageDataContent {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "image_data" &&
    typeof (value as { data?: unknown }).data === "string"
  );
}

function _encodeRef(hash: string): string {
  return BLOB_REF_PREFIX + hash;
}

/** The content hash a data string references, or `null` if it is inline data. */
function _parseRef(data: string): string | null {
  return data.startsWith(BLOB_REF_PREFIX)
    ? data.slice(BLOB_REF_PREFIX.length)
    : null;
}

/** Visit every `image_data` node reachable from `value`. */
function _collect(
  value: unknown,
  visit: (node: ImageDataContent) => void
): void {
  if (Array.isArray(value)) {
    for (const item of value) _collect(item, visit);
    return;
  }
  if (value && typeof value === "object") {
    if (_isImageData(value)) {
      visit(value);
      return;
    }
    for (const item of Object.values(value)) _collect(item, visit);
  }
}

/**
 * Return a copy of `value` with every `image_data.data` string mapped through
 * `fn`. Structurally shares (copy-on-write) any subtree that didn't change, so
 * an untouched thread is returned by reference.
 */
function _map(value: unknown, fn: (data: string) => string): unknown {
  if (Array.isArray(value)) {
    const items = value as unknown[];
    let changed = false;
    const next = items.map((item) => {
      const mapped = _map(item, fn);
      if (mapped !== item) changed = true;
      return mapped;
    });
    return changed ? next : value;
  }
  if (value && typeof value === "object") {
    if (_isImageData(value)) {
      const nextData = fn(value.data);
      return nextData === value.data ? value : { ...value, data: nextData };
    }
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const mapped = _map(item, fn);
      if (mapped !== item) changed = true;
      next[key] = mapped;
    }
    return changed ? next : value;
  }
  return value;
}

/**
 * Rewrite every `image_data.data` in `thread` by keying each one with `extract`,
 * resolving each distinct key to its replacement in parallel, then swapping the
 * values in. `extract` returns `null` for data that should be left untouched.
 * The in-memory `thread` is never mutated; unchanged threads are returned by
 * reference.
 */
async function _remapImages(
  thread: Thread,
  extract: (data: string) => string | null,
  resolve: (key: string) => Promise<string>
): Promise<Thread> {
  const keys = new Set<string>();
  _collect(thread, (node) => {
    const key = extract(node.data);
    if (key !== null) keys.add(key);
  });
  if (keys.size === 0) return thread;

  const replacement = new Map<string, string>();
  await Promise.all(
    [...keys].map(async (key) => {
      replacement.set(key, await resolve(key));
    })
  );

  return _map(thread, (data) => {
    const key = extract(data);
    return key !== null ? (replacement.get(key) ?? data) : data;
  }) as Thread;
}

/**
 * Produce a serializable copy of `thread` with large inline images offloaded to
 * `blobs` and replaced by content-hash references. Identical images (including
 * the same asset duplicated across every run-history snapshot) collapse to a
 * single stored blob.
 */
export function dehydrateThreadImages(
  thread: Thread,
  blobs: BlobStore
): Promise<Thread> {
  return _remapImages(
    thread,
    (data) =>
      data.length >= MIN_OFFLOAD_LENGTH && !_parseRef(data) ? data : null,
    async (data) => _encodeRef(await blobs.put(Buffer.from(data, "base64")))
  );
}

/**
 * Reverse {@link dehydrateThreadImages}: replace any blob references in `thread`
 * with the inline base64 they point at, so callers only ever see whole images.
 * Threads without references are returned unchanged.
 */
export function rehydrateThreadImages(
  thread: Thread,
  blobs: BlobStore
): Promise<Thread> {
  return _remapImages(
    thread,
    _parseRef,
    async (hash) => Buffer.from(await blobs.get(hash)).toString("base64")
  );
}
