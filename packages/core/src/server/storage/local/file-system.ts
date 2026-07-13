import * as fs from "node:fs/promises";
import * as path from "node:path";

import {
  normalizeThread,
  type FileNode,
  type FileSystem,
  type Thread,
  type ThreadStorage,
} from "../../../types";
import { packThreadImages, unpackThreadImages } from "../blob";

/**
 * A {@link FileSystem} and {@link ThreadStorage} backed by the local
 * filesystem, rooted at a directory passed to the constructor. Every operation
 * is confined to that root: paths are treated as relative to the root and any
 * attempt to escape (via `..`, absolute segments, etc.) is rejected.
 */
export class LocalFileSystem implements FileSystem, ThreadStorage {
  /** The absolute, resolved root directory. */
  private readonly root: string;

  /**
   * @param root The directory that backs the storage root. Resolved to an
   *   absolute path; all operations are confined within it.
   */
  constructor(root: string) {
    this.root = path.resolve(root);
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
  }

  async mv(src: string, dest: string): Promise<void> {
    await fs.rename(this._resolve(src), this._resolve(dest));
  }

  async rm(p: string): Promise<void> {
    const real = this._resolve(p);
    if (real === this.root) {
      throw new Error("Cannot remove the storage root.");
    }
    await fs.rm(real, { recursive: true });
  }

  // --- ThreadStorage ------------------------------------------------------

  async read(p: string): Promise<Thread> {
    const text = await fs.readFile(this._resolve(p), "utf8");
    const parsed = JSON.parse(text) as Thread;
    return normalizeThread(unpackThreadImages(parsed));
  }

  async write(p: string, thread: Thread): Promise<void> {
    const real = this._resolve(p);
    await fs.mkdir(path.dirname(real), { recursive: true });
    const serializable = packThreadImages(normalizeThread(thread));
    await fs.writeFile(real, JSON.stringify(serializable, null, 2), "utf8");
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
    const real = path.resolve(this.root, this._relative(p));
    if (real !== this.root && !real.startsWith(this.root + path.sep)) {
      throw new Error(`Path escapes the storage root: ${p}`);
    }
    return real;
  }

  /** Whether a real directory contains any entries. */
  private async _hasChildren(realDir: string): Promise<boolean> {
    const entries = await fs.readdir(realDir);
    return entries.length > 0;
  }
}
