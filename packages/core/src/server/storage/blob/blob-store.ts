import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * A content-addressable blob store: bytes in, a stable content hash out.
 *
 * The hash is the sole identifier — writing the same bytes twice yields the
 * same key and stores a single copy. This is what lets the persistence layer
 * de-duplicate large inline assets (e.g. base64 images repeated across every
 * run-history snapshot of a thread) down to one on-disk blob.
 */
export interface BlobStore {
  /**
   * Store `data`, returning its content hash (hex SHA-256). Idempotent: storing
   * identical bytes is a no-op that returns the same key.
   */
  put(data: Uint8Array): Promise<string>;

  /**
   * Read the bytes for a content hash. Rejects if the blob is missing.
   */
  get(hash: string): Promise<Uint8Array>;

  /**
   * Whether a blob with the given content hash exists.
   */
  has(hash: string): Promise<boolean>;
}

/**
 * A {@link BlobStore} backed by a local directory. Blobs are stored by their
 * hex SHA-256 under a two-character shard directory (`ab/abcdef…`) to keep any
 * single directory from growing unbounded.
 */
export class LocalBlobStore implements BlobStore {
  /** The absolute, resolved root directory holding the blobs. */
  private readonly _root: string;

  /**
   * @param root Directory that backs the blob store. Resolved to an absolute
   *   path; created lazily on first write.
   */
  constructor(root: string) {
    this._root = path.resolve(root);
  }

  async put(data: Uint8Array): Promise<string> {
    const hash = createHash("sha256").update(data).digest("hex");
    const file = this._path(hash);

    // Content-addressed, so an existing blob already holds identical bytes.
    if (await this.has(hash)) {
      return hash;
    }

    await fs.mkdir(path.dirname(file), { recursive: true });
    // Write to a unique temp file then rename so a concurrent reader never sees
    // a half-written blob (rename is atomic within a filesystem).
    const tmp = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tmp, data);
      await fs.rename(tmp, file);
    } catch (error) {
      await fs.rm(tmp, { force: true });
      throw error;
    }
    return hash;
  }

  async get(hash: string): Promise<Uint8Array> {
    return fs.readFile(this._path(hash));
  }

  async has(hash: string): Promise<boolean> {
    try {
      await fs.access(this._path(hash));
      return true;
    } catch {
      return false;
    }
  }

  /** Resolve the on-disk path for a content hash, rejecting malformed hashes. */
  private _path(hash: string): string {
    if (!/^[0-9a-f]{64}$/.test(hash)) {
      throw new Error(`Invalid blob hash: ${hash}`);
    }
    return path.join(this._root, hash.slice(0, 2), hash);
  }
}
