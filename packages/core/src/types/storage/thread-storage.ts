import { Thread } from "../threads/thread";

/**
 * Storage for threads: read and overwrite a single Thread by path.
 *
 * Designed to pair with ThreadPlayground — `read` provides its `initialValue`
 * and `write` persists its `onChange`. Serialization between Thread and its
 * on-disk representation is handled inside the implementation; callers only
 * ever see a Thread.
 */
export interface ThreadStorage {
  /**
   * Read and parse the Thread stored at the given path.
   */
  read(path: string): Promise<Thread>;

  /**
   * Overwrite the file at the given path with the serialized Thread, creating
   * parent directories as needed.
   */
  write(path: string, thread: Thread): Promise<void>;
}

/**
 * A fully-resolved address of one concrete Thread file/version inside a
 * backend. Returned by {@link ReadableThreadStorage.resolveLatest} and by
 * {@link WritableThreadStorage.write}; passed back to
 * {@link ReadableThreadStorage.read}. Treat it as an opaque token — callers
 * pass it around rather than constructing or parsing its parts.
 */
export interface ThreadLocator {
  /**
   * Storage-scoped resource id — a gist id, or (for a local backend) a path.
   */
  id: string;

  /**
   * The concrete file within the resource, e.g. "browser-use-evolving-01.json".
   */
  filename: string;

  /**
   * Resolved version; populated only by versioned backends (a gist commit
   * SHA). Undefined for single-version backends.
   */
  version?: string;
}

/**
 * Read side of single-Thread storage, addressed by an opaque resource id.
 *
 * Reading is two steps: resolve an id to the {@link ThreadLocator} of its
 * current latest version (version + filename), then read that locator into a
 * Thread. Non-versioned backends simply leave {@link ThreadLocator.version}
 * undefined. Serialization is handled inside the implementation; callers only
 * ever see a Thread.
 */
export interface ReadableThreadStorage {
  /**
   * Resolve a resource id to the locator of its latest version.
   */
  resolveLatest(id: string): Promise<ThreadLocator>;

  /**
   * Read and parse the Thread at a fully-resolved locator.
   */
  read(locator: ThreadLocator): Promise<Thread>;
}

/**
 * Write side of single-Thread storage. `write` is an upsert: with no id it
 * creates a new resource and returns its freshly-minted locator; with an id it
 * overwrites / adds a new version to the existing resource. Every write becomes
 * the new latest that {@link ReadableThreadStorage.resolveLatest} will return.
 */
export interface WritableThreadStorage {
  write(thread: Thread, id?: string): Promise<ThreadLocator>;
}

/**
 * A {@link ReadableThreadStorage} whose backend keeps a full version history
 * (e.g. gist revisions). Currently just a marker distinguishing versioned
 * backends from single-version ones; version-listing is a future extension.
 */
export interface VersionedThreadStorage extends ReadableThreadStorage {
  // listVersions(id: string): Promise<ThreadVersion[]>;  // deferred
}

/**
 * A backend supporting both reading the latest version and upserting.
 */
export interface ThreadStore
  extends ReadableThreadStorage,
    WritableThreadStorage {}
