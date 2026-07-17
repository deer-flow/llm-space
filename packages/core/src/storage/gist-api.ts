import type { ThreadLocator } from "../types/storage/thread-storage";

/**
 * Internal GitHub Gist API helpers shared by {@link GistThreadReader} and
 * {@link GistThreadWriter}. Not part of the public storage surface — the two
 * classes are the API; these functions just keep them DRY.
 *
 * Every call uses an injected `fetch` (defaulting to the global). In the bun
 * process that global is proxied by `NetworkSettingsManager`; in the browser it
 * is the platform fetch. Reads are anonymous; a token, when present, is only
 * used to lift the 60-requests/hour anonymous rate limit (and to authorize
 * writes).
 */

/** The default GitHub REST API base. */
export const GITHUB_API_BASE = "https://api.github.com";

const USER_AGENT = "LLM-Space";
const API_VERSION = "2022-11-28";

/** A token provider: returns the current token, or null when signed out. */
export type TokenProvider = () => string | null | Promise<string | null>;

/** One file entry in a gist API response. */
export interface GistFile {
  filename?: string;
  content?: string;
  /** True when `content` was omitted because the file exceeds ~1 MB. */
  truncated?: boolean;
  /** Points at the file's full raw content (used when `truncated`). */
  raw_url?: string;
}

/** One revision in a gist's history, newest first. */
export interface GistRevision {
  version?: string;
  committed_at?: string;
}

/** The (subset of the) gist API response shape we depend on. */
export interface GistResponse {
  id?: string;
  files?: Record<string, GistFile>;
  history?: GistRevision[];
}

/** An error carrying the HTTP status of a failed gist API call. */
export class GistApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "GistApiError";
  }
}

/**
 * Issue a GitHub API request against `${baseUrl}${path}`, returning the parsed
 * JSON body. Sets the standard GitHub headers and, when a token is available,
 * an `Authorization: Bearer` header. Throws a {@link GistApiError} with a
 * message tuned to the status (rate limit, auth) on any non-2xx response.
 */
export async function gistRequest<T = GistResponse>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  path: string,
  options: { token?: string | null; init?: RequestInit } = {}
): Promise<T> {
  const { token, init } = options;
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", API_VERSION);
  headers.set("User-Agent", USER_AGENT);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetchImpl(`${baseUrl}${path}`, { ...init, headers });
  if (!res.ok) {
    throw new GistApiError(_errorMessage(res.status, path), res.status);
  }
  return (await res.json()) as T;
}

/**
 * Pick the Thread file out of a gist's files: the first `*.json` file, falling
 * back to the first file of any kind. Returns null when the gist has no files.
 */
export function selectThreadFile(
  files: Record<string, GistFile> | undefined
): GistFile | null {
  const entries = Object.values(files ?? {});
  const json = entries.find((f) => f.filename?.endsWith(".json"));
  return json ?? entries[0] ?? null;
}

/**
 * Resolve a gist id to the locator of its latest version: one `GET /gists/{id}`
 * yielding the newest revision's SHA and the selected Thread filename.
 */
export async function resolveLatestLocator(
  fetchImpl: typeof fetch,
  baseUrl: string,
  id: string,
  token?: string | null
): Promise<ThreadLocator> {
  const gist = await gistRequest(fetchImpl, baseUrl, `/gists/${id}`, { token });
  const file = selectThreadFile(gist.files);
  if (!file?.filename) {
    throw new Error(`Gist ${id} has no readable file.`);
  }
  return {
    id: gist.id ?? id,
    filename: file.filename,
    version: gist.history?.[0]?.version,
  };
}

function _errorMessage(status: number, path: string): string {
  if (status === 403) {
    return `GitHub API rate limit exceeded (${path}). Anonymous reads are limited to 60/hour per IP; sign in to raise it.`;
  }
  if (status === 401) {
    return `GitHub authentication failed (${path}). The token is missing or invalid.`;
  }
  if (status === 404) {
    return `Gist not found (${path}).`;
  }
  return `GitHub API request failed with HTTP ${status} (${path}).`;
}
