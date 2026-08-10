import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import * as z from "zod";

import {
  atomicWriteJsonFile,
  PersistedJsonError,
  readJsonFile,
} from "../../json-file";

/** Name of the per-resource marker file inside a history folder. */
const INDEX_FILE_NAME = "index.json";

/** How long an orphaned folder is retained before it is reclaimed. */
const ORPHAN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Entry file names are opaque refs minted by the caller: 64 hex + `.json`. */
const ENTRY_REF_PATTERN = /^[a-f0-9]{64}\.json$/;

const IndexFileSchema = z.object({
  version: z.literal(1),
  resource: z.string().min(1),
  orphanedAt: z.number().optional(),
});

type IndexFile = z.infer<typeof IndexFileSchema>;

/**
 * Durable storage for thread run snapshots, kept out of the user's workspace.
 *
 * Derived data never sits next to the file it belongs to. Every tracked
 * resource gets its own folder under the store root, named by a hash of the
 * resource key, holding an {@link IndexFile} marker plus one JSON file per
 * entry:
 *
 * ```
 * <root>/<sha256(resourceKey)>/index.json
 * <root>/<sha256(resourceKey)>/<entryRef>
 * ```
 *
 * The marker is what makes the store maintainable: it maps a folder back to
 * the resource that owns it, so {@link RunHistoryStore.maintain} can reclaim
 * folders whose resource is gone for good.
 */
export class RunHistoryStore {
  /** The absolute, resolved store root. */
  private readonly _root: string;

  /**
   * @param root The directory that backs the store. Resolved to an absolute
   *   path; created lazily on the first write.
   */
  constructor(root: string) {
    this._root = path.resolve(root);
  }

  /** Persist one entry, (re)claiming the resource's folder as live. */
  async writeEntry(
    resourceKey: string,
    entryRef: string,
    payload: unknown
  ): Promise<void> {
    const entryPath = this._entryPath(resourceKey, entryRef);
    // Marker first: a folder that has entries but no marker reads as garbage
    // to `maintain()`, while a marker without entries is harmless.
    await this._writeIndex(this._folder(resourceKey), resourceKey);
    await atomicWriteJsonFile(entryPath, payload);
  }

  /** Read one entry, validated against the caller's schema. */
  async readEntry<T>(
    resourceKey: string,
    entryRef: string,
    schema: z.ZodType<T>
  ): Promise<T> {
    const result = await readJsonFile(this._entryPath(resourceKey, entryRef), {
      schema,
    });
    return result.value;
  }

  /**
   * Drop every entry the resource no longer references. A folder left without
   * entries is removed outright, marker included.
   */
  async prune(
    resourceKey: string,
    retainedRefs: Iterable<string>
  ): Promise<void> {
    const folder = this._folder(resourceKey);
    const entries = await this._readEntryNames(folder);
    if (entries === null) return;

    const retained = new Set(retainedRefs);
    const survivors = entries.filter((entry) => retained.has(entry));
    await Promise.all(
      entries
        .filter((entry) => !retained.has(entry))
        .map((entry) => fs.rm(path.join(folder, entry), { force: true }))
    );
    if (survivors.length === 0) {
      await fs.rm(folder, { force: true, recursive: true });
    }
  }

  /** Re-key a resource's folder, e.g. after its thread file was renamed. */
  async move(fromKey: string, toKey: string): Promise<void> {
    await this._rekey(fromKey, toKey, (from, to) => fs.rename(from, to));
  }

  /** Duplicate a resource's folder under a new key. */
  async copy(fromKey: string, toKey: string): Promise<void> {
    await this._rekey(fromKey, toKey, (from, to) =>
      fs.cp(from, to, { recursive: true })
    );
  }

  /**
   * Reclaim folders whose resource is gone. A folder is stamped the first time
   * its resource is missing and removed once the stamp is older than the
   * retention window, so a thread restored from the trash keeps its history.
   * Best-effort: a single unreadable folder never aborts the sweep.
   *
   * @param isLive Whether the resource behind a key still exists.
   */
  async maintain(
    isLive: (resourceKey: string) => Promise<boolean>
  ): Promise<void> {
    let folders: string[];
    try {
      const entries = await fs.readdir(this._root, { withFileTypes: true });
      folders = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch {
      return;
    }

    for (const name of folders) {
      const folder = path.join(this._root, name);
      try {
        await this._maintainFolder(folder, isLive);
      } catch (error) {
        console.warn(`Run history maintenance skipped ${name}:`, error);
      }
    }
  }

  private async _maintainFolder(
    folder: string,
    isLive: (resourceKey: string) => Promise<boolean>
  ): Promise<void> {
    const index = await this._readIndex(folder);
    if (!index) {
      await fs.rm(folder, { force: true, recursive: true });
      return;
    }
    if (await isLive(index.resource)) {
      if (index.orphanedAt !== undefined) {
        await this._writeIndex(folder, index.resource);
      }
      return;
    }
    if (index.orphanedAt === undefined) {
      await this._writeIndex(folder, index.resource, Date.now());
      return;
    }
    if (Date.now() - index.orphanedAt > ORPHAN_RETENTION_MS) {
      await fs.rm(folder, { force: true, recursive: true });
    }
  }

  private async _rekey(
    fromKey: string,
    toKey: string,
    transfer: (from: string, to: string) => Promise<void>
  ): Promise<void> {
    if (fromKey === toKey) return;
    const from = this._folder(fromKey);
    const to = this._folder(toKey);
    if ((await this._readEntryNames(from)) === null) return;

    await fs.rm(to, { force: true, recursive: true });
    await transfer(from, to);
    await this._writeIndex(to, toKey);
  }

  /** Entry file names in a folder, or null when the folder does not exist. */
  private async _readEntryNames(folder: string): Promise<string[] | null> {
    try {
      const entries = await fs.readdir(folder, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && ENTRY_REF_PATTERN.test(entry.name))
        .map((entry) => entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  /**
   * The folder's marker, or null when it is missing or unusable. A transient
   * IO failure is rethrown instead: `maintain()` deletes what reads as null,
   * and an unreadable disk must not be mistaken for garbage.
   */
  private async _readIndex(folder: string): Promise<IndexFile | null> {
    try {
      const result = await readJsonFile(path.join(folder, INDEX_FILE_NAME), {
        schema: IndexFileSchema,
      });
      return result.value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      if (error instanceof PersistedJsonError) return null;
      throw error;
    }
  }

  private async _writeIndex(
    folder: string,
    resourceKey: string,
    orphanedAt?: number
  ): Promise<void> {
    const current = await this._readIndex(folder);
    if (
      current?.resource === resourceKey &&
      current.orphanedAt === orphanedAt
    ) {
      return;
    }
    await atomicWriteJsonFile(path.join(folder, INDEX_FILE_NAME), {
      version: 1,
      resource: resourceKey,
      ...(orphanedAt === undefined ? {} : { orphanedAt }),
    } satisfies IndexFile);
  }

  private _entryPath(resourceKey: string, entryRef: string): string {
    if (!ENTRY_REF_PATTERN.test(entryRef)) {
      throw new Error(`Invalid run snapshot reference: ${entryRef}`);
    }
    return path.join(this._folder(resourceKey), entryRef);
  }

  private _folder(resourceKey: string): string {
    return path.join(
      this._root,
      createHash("sha256").update(resourceKey).digest("hex")
    );
  }
}
