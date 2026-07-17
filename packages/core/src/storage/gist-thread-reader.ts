import type {
  ReadableThreadStorage,
  ThreadLocator,
  VersionedThreadStorage,
} from "../types/storage/thread-storage";
import {
  normalizeThread,
  type Thread,
} from "../types/threads/thread";

import {
  GITHUB_API_BASE,
  gistRequest,
  resolveLatestLocator,
  selectThreadFile,
  type GistResponse,
  type TokenProvider,
} from "./gist-api";

export interface GistThreadReaderOptions {
  /**
   * Optional token provider. Reads work fully anonymously; a token is only used
   * to lift the 60-requests/hour anonymous rate limit. The web page passes
   * nothing; the desktop app can pass its GitHub token.
   */
  getToken?: TokenProvider;

  /** Injectable for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;

  /** API base; defaults to {@link GITHUB_API_BASE}. */
  baseUrl?: string;
}

/**
 * Reads a single Thread from a public/secret GitHub gist. Anonymous and
 * browser-safe (global `fetch` only), so both the static web viewer and the
 * desktop app can share it. Implements the read + versioning halves of the
 * storage seam; writing lives in {@link GistThreadWriter}.
 */
export class GistThreadReader
  implements ReadableThreadStorage, VersionedThreadStorage
{
  private readonly _fetch: typeof fetch;
  private readonly _baseUrl: string;
  private readonly _getToken?: TokenProvider;

  constructor(options: GistThreadReaderOptions = {}) {
    this._fetch = options.fetch ?? fetch;
    this._baseUrl = options.baseUrl ?? GITHUB_API_BASE;
    this._getToken = options.getToken;
  }

  /** Resolve a gist id to the locator of its latest revision. */
  async resolveLatest(id: string): Promise<ThreadLocator> {
    return resolveLatestLocator(
      this._fetch,
      this._baseUrl,
      id,
      await this._token()
    );
  }

  /**
   * Read the Thread at a resolved locator. Targets the pinned `version` when
   * present, else the latest. Follows `raw_url` when the inline content was
   * truncated (>1 MB), then parses and normalizes the Thread.
   */
  async read(locator: ThreadLocator): Promise<Thread> {
    const token = await this._token();
    const path = locator.version
      ? `/gists/${locator.id}/${locator.version}`
      : `/gists/${locator.id}`;
    const gist = await gistRequest<GistResponse>(
      this._fetch,
      this._baseUrl,
      path,
      { token }
    );

    const file =
      gist.files?.[locator.filename] ?? selectThreadFile(gist.files);
    if (!file) {
      throw new Error(
        `Gist ${locator.id} has no file "${locator.filename}".`
      );
    }

    const content =
      file.truncated && file.raw_url
        ? await this._fetch(file.raw_url).then((r) => r.text())
        : (file.content ?? "");

    return normalizeThread(_parseThread(content));
  }

  private async _token(): Promise<string | null> {
    return (await this._getToken?.()) ?? null;
  }
}

function _parseThread(content: string): Thread {
  try {
    return JSON.parse(content) as Thread;
  } catch {
    throw new Error("Gist content is not a valid thread file.");
  }
}
