import type { Thread } from "../threads/thread";

import type { ReadableThreadStorage } from "./thread-storage";

/**
 * Backend-agnostic display metadata for the shared-thread viewer page. Produced
 * by a {@link SharedThreadSource} alongside the thread itself — the title,
 * author, and source link the viewer chrome needs, none of which live on the
 * Thread.
 */
export interface SharedThreadMeta {
  /** The connector the thread was read through (e.g. "gist"). */
  connectorId: string;

  /** The connector-scoped thread id (e.g. a gist id). */
  threadId: string;

  /** The concrete file the thread was read from, e.g. "general-agent.json". */
  filename?: string;

  /** A direct link to the file's raw content (the gist `raw_url`, version-pinned). */
  rawUrl?: string;

  /** Resolved version, for versioned backends (a gist commit SHA). */
  version?: string;

  /** Display title (the thread's title, surfaced for convenience). */
  title?: string;

  /** A one-line description of the shared thread (e.g. the gist description). */
  description?: string;

  /** Who shared it. */
  author?: {
    name: string;
    avatarUrl?: string;
    /** A link to the author's profile (e.g. their GitHub page). */
    profileUrl?: string;
  };

  /** A canonical link to the underlying source (e.g. the gist's html_url). */
  sourceUrl?: string;

  /** ISO timestamp when the thread was first shared (gist `created_at`). */
  createdAt?: string;

  /** ISO timestamp of the latest revision (gist `updated_at`). */
  updatedAt?: string;
}

/** A thread paired with its shared-viewer display metadata. */
export interface SharedThread {
  thread: Thread;
  meta: SharedThreadMeta;
}

/**
 * Optional capability: a storage that can return a thread together with the
 * display metadata a shared-viewer page needs. Detect with
 * `"readShared" in storage`.
 */
export interface SharedThreadSource {
  readShared(
    threadId: string,
    options?: { signal?: AbortSignal }
  ): Promise<SharedThread>;
}

/**
 * Holds a readable thread storage under a stable `connectorId`. A connector is
 * the unit the shared-link identity (`{connectorId, threadId}`) resolves
 * through, and the future home for connector-level concerns like
 * authentication. V1 is deliberately minimal.
 */
export interface ThreadConnector {
  readonly connectorId: string;
  readonly storage: ReadableThreadStorage;
}
