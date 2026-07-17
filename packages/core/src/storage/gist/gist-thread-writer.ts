import type {
  ThreadLocator,
  WritableThreadStorage,
} from "../../types/storage/thread-storage";
import { normalizeThread, type Thread } from "../../types/threads/thread";

import {
  GITHUB_API_BASE,
  gistRequest,
  resolveLatestLocator,
  type GistResponse,
  type TokenProvider,
} from "./gist-api";

export interface GistThreadWriterOptions {
  /**
   * Required token provider — writing a gist is an authenticated call (needs
   * the `gist` scope). Returns null when signed out, which makes `write` throw.
   */
  getToken: TokenProvider;

  /** Injectable for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;

  /** API base; defaults to {@link GITHUB_API_BASE}. */
  baseUrl?: string;

  /**
   * Whether newly-created gists are public. Default false (secret). Secret
   * gists are still readable by anyone with the URL, so shared links work; they
   * are just not listed on the owner's profile.
   */
  public?: boolean;
}

/** Fallback filename when a thread has no usable title. */
const DEFAULT_FILENAME = "thread.json";

/**
 * Upserts a single Thread into a GitHub gist. Authenticated and write-only —
 * the desktop app owns this; the static web page never imports it. Reading back
 * is {@link GistThreadReader}'s job.
 */
export class GistThreadWriter implements WritableThreadStorage {
  private readonly _fetch: typeof fetch;
  private readonly _baseUrl: string;
  private readonly _getToken: TokenProvider;
  private readonly _public: boolean;

  constructor(options: GistThreadWriterOptions) {
    // Bind to the global so a method call never trips "Illegal invocation".
    this._fetch = options.fetch ?? fetch.bind(globalThis);
    this._baseUrl = options.baseUrl ?? GITHUB_API_BASE;
    this._getToken = options.getToken;
    this._public = options.public ?? false;
  }

  /**
   * Upsert the Thread. With no `id`, create a new gist and return its locator.
   * With an `id`, overwrite the existing thread file in place (reusing its
   * filename so a title change doesn't orphan the old file) and return the new
   * revision's locator.
   *
   * The gist's `description` (surfaced as {@link SharedThreadMeta.description} in
   * the viewer) is taken from `options.description` when provided; otherwise it
   * falls back to the thread title. Pass an empty string to publish with no
   * description.
   */
  async write(
    thread: Thread,
    id?: string,
    options?: { description?: string }
  ): Promise<ThreadLocator> {
    const token = await this._getToken();
    if (!token) {
      throw new Error("GitHub sign-in required to save to a gist.");
    }

    const normalized = normalizeThread(thread);
    // Publish a clean thread: local run history is per-machine debug state, not
    // part of what's shared, so upload it with an empty `runHistory`.
    const published: Thread = { ...normalized, runHistory: [] };
    const content = JSON.stringify(published, null, 2);
    const description = options?.description ?? normalized.title ?? "";

    return id
      ? this._update(id, content, description, token)
      : this._create(normalized, content, description, token);
  }

  private async _create(
    thread: Thread,
    content: string,
    description: string,
    token: string
  ): Promise<ThreadLocator> {
    const filename = _threadFilename(thread);
    const gist = await gistRequest<GistResponse>(
      this._fetch,
      this._baseUrl,
      "/gists",
      {
        token,
        init: {
          method: "POST",
          body: JSON.stringify({
            description,
            public: this._public,
            files: { [filename]: { content } },
          }),
        },
      }
    );
    return _locatorFrom(gist, gist.id ?? "", filename);
  }

  private async _update(
    id: string,
    content: string,
    description: string,
    token: string
  ): Promise<ThreadLocator> {
    // Reuse the existing filename so overwriting updates the same file rather
    // than adding a second one.
    const existing = await resolveLatestLocator(
      this._fetch,
      this._baseUrl,
      id,
      token
    );
    const filename = existing.filename;
    const gist = await gistRequest<GistResponse>(
      this._fetch,
      this._baseUrl,
      `/gists/${id}`,
      {
        token,
        init: {
          method: "PATCH",
          body: JSON.stringify({
            description,
            files: { [filename]: { content } },
          }),
        },
      }
    );
    return _locatorFrom(gist, id, filename);
  }
}

function _locatorFrom(
  gist: GistResponse,
  id: string,
  filename: string
): ThreadLocator {
  return { id: gist.id ?? id, filename, version: gist.history?.[0]?.version };
}

/**
 * Derive a gist filename from the thread title: a lowercase kebab slug plus
 * `.json`, falling back to {@link DEFAULT_FILENAME} when the title is empty or
 * slugifies to nothing.
 */
function _threadFilename(thread: Thread): string {
  const slug = (thread.title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug ? `${slug}.json` : DEFAULT_FILENAME;
}
