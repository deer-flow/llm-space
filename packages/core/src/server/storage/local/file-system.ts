import { createHash } from "node:crypto";
import { lstatSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import * as z from "zod";

import {
  createRunPreview,
  isRunSnapshot,
  normalizeRunHistory,
  snapshotThread,
} from "../../../thread";
import {
  normalizeThread,
  PersistedThreadZodSchema,
  RecoverablePersistedThreadZodSchema,
  type FileNode,
  type FileSystem,
  type Thread,
  type ThreadRunReference,
  type ThreadRunSnapshot,
  type ThreadSnapshot,
  type ThreadStorage,
} from "../../../types";
import { atomicWriteJsonFile, readJsonFile } from "../../json-file";
import { packThreadImages, unpackThreadImages } from "../blob";

import { RunHistoryStore } from "./run-history-store";

const RunSnapshotFileSchema = z.object({
  version: z.literal(1),
  thread: PersistedThreadZodSchema,
});

export interface LocalFileSystemOptions {
  /**
   * Directory backing the {@link RunHistoryStore}. Required, and expected to
   * live outside {@link LocalFileSystem}'s root: run snapshots are derived
   * data and never belong in the user's workspace.
   */
  historyRoot: string;
}

/**
 * A {@link FileSystem} and {@link ThreadStorage} backed by the local
 * filesystem, rooted at a directory passed to the constructor. Every operation
 * is confined to that root: paths are treated as relative to the root and any
 * attempt to escape (via `..`, absolute segments, etc.) is rejected.
 *
 * Run snapshots are kept in a separate {@link RunHistoryStore}, keyed by each
 * thread's root-relative path, so the workspace holds nothing but the files
 * the user created.
 */
export class LocalFileSystem implements FileSystem, ThreadStorage {
  /** The absolute, resolved root directory. */
  private readonly root: string;

  /** Where run snapshots live, outside the workspace. */
  private readonly _runHistory: RunHistoryStore;

  /**
   * @param root The directory that backs the storage root. Resolved to an
   *   absolute path; all operations are confined within it.
   * @param options Storage locations that sit outside the root.
   */
  constructor(root: string, options: LocalFileSystemOptions) {
    this.root = path.resolve(root);
    this._runHistory = new RunHistoryStore(options.historyRoot);
  }

  // --- FileSystem ---------------------------------------------------------

  async ls(p: string): Promise<FileNode[]> {
    const real = this._resolve(p);
    const dirRel = this._relative(p);

    const entries = await fs.readdir(real, { withFileTypes: true });
    const nodes = await Promise.all(
      entries.map(async (entry): Promise<FileNode> => {
        const isDir = entry.isDirectory();
        const node: FileNode = {
          name: entry.name,
          path: path.posix.join(dirRel, entry.name),
          type: isDir ? "directory" : "file",
        };
        if (isDir) {
          node.hasChildren = await this._hasChildren(
            path.join(real, entry.name)
          );
        }
        return node;
      })
    );

    // Directories first, then alphabetical, for a stable tree ordering.
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async mkdir(p: string): Promise<void> {
    await fs.mkdir(this._resolve(p), { recursive: true });
  }

  async cp(src: string, dest: string): Promise<void> {
    await fs.cp(this._resolve(src), this._resolve(dest), { recursive: true });
    await this._transferRunHistory(src, dest, "copy");
  }

  async mv(src: string, dest: string): Promise<void> {
    const source = this._resolve(src);
    const destination = this._resolve(dest);
    if (source === destination) return;

    if (await this._exists(destination)) {
      throw new Error(`Cannot move: destination already exists: ${dest}`);
    }
    await fs.rename(source, destination);
    await this._transferRunHistory(src, dest, "move");
  }

  async rm(p: string): Promise<void> {
    const real = this._resolve(p);
    if (real === this.root) {
      throw new Error("Cannot remove the storage root.");
    }
    // Run history deliberately outlives the thread: a file restored from the
    // trash keeps its runs. Orphans are reclaimed by `maintainRunHistory()`.
    await fs.rm(real, { recursive: true });
  }

  // --- ThreadStorage ------------------------------------------------------

  async read(p: string): Promise<Thread> {
    const real = this._resolve(p);
    const result = await readJsonFile(real, {
      schema: PersistedThreadZodSchema,
      recovery: "best-effort",
      recoverySchema: RecoverablePersistedThreadZodSchema,
      repair: false,
    });
    const thread = normalizeThread(unpackThreadImages(result.value));
    const canonical = await this._externalizeRunHistory(real, thread);
    if (result.source === "recovered" || canonical !== thread) {
      await this._writeThread(real, canonical);
      console.warn(
        result.source === "recovered"
          ? `Recovered truncated thread ${p}; backup: ${result.backupPath}`
          : `Migrated inline run history for ${p}.`
      );
    }
    return canonical;
  }

  async write(p: string, thread: Thread): Promise<void> {
    const real = this._resolve(p);
    const canonical = await this._externalizeRunHistory(
      real,
      normalizeThread(thread)
    );
    await this._writeThread(real, canonical);
    await this._runHistory.prune(
      this._resourceKey(p),
      (canonical.runHistoryIndex ?? []).map((run) => run.snapshotRef)
    );
  }

  /** Persist one complete run snapshot and return its lightweight reference. */
  async archiveRun(
    p: string,
    run: ThreadRunSnapshot & { id: string }
  ): Promise<ThreadRunReference> {
    const snapshotRef = this._snapshotRef(run.id);
    const thread = snapshotThread(run.thread);
    const serializable = packThreadImages(thread);
    PersistedThreadZodSchema.parse(serializable);
    await this._runHistory.writeEntry(this._resourceKey(p), snapshotRef, {
      version: 1,
      thread: serializable,
    });
    return {
      id: run.id,
      timestamp: run.timestamp,
      snapshotRef,
      preview: createRunPreview(thread),
      ...(run.usage ? { usage: run.usage } : {}),
    };
  }

  /** Load one complete run snapshot from its opaque reference. */
  async readRunSnapshot(
    p: string,
    snapshotRef: string
  ): Promise<ThreadSnapshot> {
    const entry = await this._runHistory.readEntry(
      this._resourceKey(p),
      snapshotRef,
      RunSnapshotFileSchema
    );
    return snapshotThread(unpackThreadImages(entry.thread));
  }

  /**
   * Reclaim run history whose thread is gone for good. Cheap enough to run at
   * startup and safe to call concurrently with ordinary storage traffic.
   */
  async maintainRunHistory(): Promise<void> {
    await this._runHistory.maintain(async (resource) => {
      try {
        await fs.lstat(this._resolve(resource));
        return true;
      } catch {
        return false;
      }
    });
  }

  private async _writeThread(real: string, thread: Thread): Promise<void> {
    const serializable = packThreadImages(normalizeThread(thread));
    PersistedThreadZodSchema.parse(serializable);
    await atomicWriteJsonFile(real, serializable);
  }

  /**
   * The absolute filesystem path for a root-relative path, confined to the
   * root (same rules as every operation). Useful for handing a real path to
   * the OS — e.g. revealing a file in Finder/Explorer.
   */
  realpath(p: string): string {
    return this._resolve(p);
  }

  // --- internals ----------------------------------------------------------

  /**
   * Normalize a path to a clean relative POSIX path against the root.
   * Prefixing with "/" before normalizing collapses any `..` so it can never
   * climb above the root; the leading slash is then dropped.
   */
  private _relative(p: string): string {
    return path.posix.normalize("/" + p).slice(1);
  }

  /**
   * Map a path to a real filesystem path under the root, rejecting any path
   * that would escape it.
   */
  private _resolve(p: string): string {
    if (path.posix.isAbsolute(p) || path.win32.isAbsolute(p)) {
      throw new Error(`Path must be relative to the storage root: ${p}`);
    }
    const relative = this._relative(p);
    const real = path.resolve(this.root, relative);
    if (real !== this.root && !real.startsWith(this.root + path.sep)) {
      throw new Error(`Path escapes the storage root: ${p}`);
    }
    let current = this.root;
    for (const part of relative.split(path.sep)) {
      if (!part) continue;
      current = path.join(current, part);
      try {
        if (lstatSync(current).isSymbolicLink()) {
          throw new Error(`Symbolic links are not allowed in storage paths: ${p}`);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
        throw error;
      }
    }
    return real;
  }

  /**
   * The run history key for a path: its clean root-relative POSIX path, with
   * the same escape check every other operation performs.
   */
  private _resourceKey(p: string): string {
    this._resolve(p);
    return this._relative(p);
  }

  /**
   * Follow a copied or moved subtree in the run history store. History is
   * keyed by the thread's path, so every thread the operation touched has to
   * be re-keyed or its runs would be stranded.
   */
  private async _transferRunHistory(
    src: string,
    dest: string,
    mode: "copy" | "move"
  ): Promise<void> {
    try {
      for (const [from, to] of await this._runHistoryKeyPairs(src, dest)) {
        await (mode === "copy"
          ? this._runHistory.copy(from, to)
          : this._runHistory.move(from, to));
      }
    } catch (error) {
      // The files themselves already moved; losing history is not worth
      // failing the operation the user asked for.
      console.warn(
        `Could not follow run history from ${src} to ${dest}:`,
        error
      );
    }
  }

  /** `[sourceKey, destinationKey]` for every thread under a moved subtree. */
  private async _runHistoryKeyPairs(
    src: string,
    dest: string
  ): Promise<[string, string][]> {
    const sourceKey = this._resourceKey(src);
    const destinationKey = this._resourceKey(dest);
    const stat = await fs.lstat(this._resolve(dest));
    if (!stat.isDirectory()) return [[sourceKey, destinationKey]];

    const suffixes = await this._filesUnder(this._resolve(dest));
    return suffixes.map((suffix) => [
      path.posix.join(sourceKey, suffix),
      path.posix.join(destinationKey, suffix),
    ]);
  }

  /** Every regular file below a real directory, as POSIX relative paths. */
  private async _filesUnder(realDir: string): Promise<string[]> {
    const entries = await fs.readdir(realDir, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry): Promise<string[]> => {
        if (entry.isDirectory()) {
          const children = await this._filesUnder(
            path.join(realDir, entry.name)
          );
          return children.map((child) => path.posix.join(entry.name, child));
        }
        return entry.isFile() ? [entry.name] : [];
      })
    );
    return nested.flat();
  }

  private async _externalizeRunHistory(
    real: string,
    thread: Thread
  ): Promise<Thread> {
    const history = normalizeRunHistory(
      thread.runHistory,
      thread.runHistoryIndex
    );
    if (!history.some(isRunSnapshot)) return thread;
    const references: ThreadRunReference[] = [];
    for (const run of history) {
      references.push(
        isRunSnapshot(run)
          ? await this.archiveRun(this._relativeFromReal(real), run)
          : run
      );
    }
    const next = { ...thread };
    delete next.runHistory;
    next.runHistoryVersion = 2;
    next.runHistoryIndex = references;
    return next;
  }

  private _snapshotRef(runId: string): string {
    return `${createHash("sha256").update(runId).digest("hex")}.json`;
  }

  private _relativeFromReal(real: string): string {
    return path.relative(this.root, real).split(path.sep).join(path.posix.sep);
  }

  private async _exists(real: string): Promise<boolean> {
    try {
      await fs.lstat(real);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  /** Whether a real directory contains any entries. */
  private async _hasChildren(realDir: string): Promise<boolean> {
    const entries = await fs.readdir(realDir);
    return entries.length > 0;
  }
}
