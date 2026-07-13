import { createHash } from "node:crypto";

import type { ImageDataContent, Thread } from "../../../types";

/**
 * Sentinel prefix marking an `image_data.data` string as a reference into the
 * file's own blob table rather than inline base64. The colon guarantees it can
 * never collide with real base64 (whose alphabet excludes `:`), so the two are
 * unambiguous.
 */
const BLOB_REF_PREFIX = "blob:sha256:";

/**
 * Minimum inline base64 length (characters) before an image is moved into the
 * blob table. Below this the indirection isn't worth it; above it, collapsing
 * the same image duplicated across every run-history snapshot pays for itself
 * many times over.
 */
const MIN_OFFLOAD_LENGTH = 1024;

/**
 * On-disk shape written by {@link packThreadImages}: a normal thread whose large
 * images have been replaced by references, plus a content-addressed table that
 * resolves them. The table travels inside the same file, so a packed thread
 * stays fully self-contained — copy, share, or import it and every image still
 * resolves with no external blob store.
 */
interface PackedThread extends Thread {
  /** Content hash (hex SHA-256 of the base64) → the base64 image it stands in for. */
  blobs?: Record<string, string>;
}

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

/** The blob-table key a data string references, or `null` if it is inline data. */
function _parseRef(data: string): string | null {
  return data.startsWith(BLOB_REF_PREFIX)
    ? data.slice(BLOB_REF_PREFIX.length)
    : null;
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
 * Produce the serializable, self-contained on-disk form of `thread`: large
 * inline images are deduplicated into a content-addressed `blobs` table and
 * replaced by references. Identical images — including the same asset repeated
 * across every run-history snapshot — collapse to a single table entry. Threads
 * with no offloadable images are returned unchanged. `thread` is never mutated.
 */
export function packThreadImages(thread: Thread): Thread {
  const table: Record<string, string> = {};
  const hashByData = new Map<string, string>();

  const packed = _map(thread, (data) => {
    if (data.length < MIN_OFFLOAD_LENGTH || _parseRef(data)) return data;
    let hash = hashByData.get(data);
    if (hash === undefined) {
      hash = createHash("sha256").update(data).digest("hex");
      hashByData.set(data, hash);
      table[hash] = data;
    }
    return _encodeRef(hash);
  }) as Thread;

  if (hashByData.size === 0) return thread;
  return { ...packed, blobs: table } as PackedThread;
}

/**
 * Reverse {@link packThreadImages}: resolve every blob reference from the file's
 * own `blobs` table back to inline base64 and drop the table, so callers only
 * ever see whole images. Threads with no table are returned unchanged.
 */
export function unpackThreadImages(parsed: Thread): Thread {
  const packed = parsed as PackedThread;
  if (!packed.blobs) return parsed;

  const { blobs: table, ...thread } = packed;
  return _map(thread, (data) => {
    const hash = _parseRef(data);
    return hash ? (table[hash] ?? data) : data;
  }) as Thread;
}
