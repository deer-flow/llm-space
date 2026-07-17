import { describe, expect, test } from "bun:test";

import type { Thread } from "../types/threads/thread";

import { GistThreadReader } from "./gist-thread-reader";
import { readLatestThread } from "./read-latest";

const GIST_ID = "113dadfadb8a0839de50e882f82b17dd";
const VERSION = "6ae1efbfd7d1197767166a88e61fe245def4135e";
const THREAD: Thread = { title: "Browser use" };

interface StubCall {
  url: string;
  init?: RequestInit;
}

/**
 * A fetch stub driven by a URL → response map. Records every call so tests can
 * assert which endpoints were hit and with what headers.
 */
function _stubFetch(
  routes: Record<string, () => Response>
): { fetch: typeof fetch; calls: StubCall[] } {
  const calls: StubCall[] = [];
  const fetchImpl = ((input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes[url];
    if (!route) throw new Error(`Unexpected fetch: ${url}`);
    return Promise.resolve(route());
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

function _json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("GistThreadReader.resolveLatest", () => {
  test("returns the newest version and the first .json filename", async () => {
    const { fetch } = _stubFetch({
      [`https://api.github.com/gists/${GIST_ID}`]: () =>
        _json({
          id: GIST_ID,
          files: {
            "notes.txt": { filename: "notes.txt", content: "hi" },
            "browser-use.json": {
              filename: "browser-use.json",
              content: JSON.stringify(THREAD),
            },
          },
          history: [{ version: VERSION }, { version: "older" }],
        }),
    });
    const reader = new GistThreadReader({ fetch });

    expect(await reader.resolveLatest(GIST_ID)).toEqual({
      id: GIST_ID,
      filename: "browser-use.json",
      version: VERSION,
    });
  });
});

describe("GistThreadReader.read", () => {
  test("reads inline content and normalizes the thread", async () => {
    const { fetch, calls } = _stubFetch({
      [`https://api.github.com/gists/${GIST_ID}/${VERSION}`]: () =>
        _json({
          id: GIST_ID,
          files: {
            "browser-use.json": {
              filename: "browser-use.json",
              content: JSON.stringify(THREAD),
            },
          },
        }),
    });
    const reader = new GistThreadReader({ fetch });

    const thread = await reader.read({
      id: GIST_ID,
      filename: "browser-use.json",
      version: VERSION,
    });

    expect(thread.title).toBe("Browser use");
    // Only the pinned-version endpoint was hit; no raw fallback.
    expect(calls).toHaveLength(1);
  });

  test("follows raw_url when the inline content is truncated", async () => {
    const rawUrl = "https://gist.githubusercontent.com/x/raw/browser-use.json";
    const { fetch, calls } = _stubFetch({
      [`https://api.github.com/gists/${GIST_ID}`]: () =>
        _json({
          id: GIST_ID,
          files: {
            "browser-use.json": {
              filename: "browser-use.json",
              truncated: true,
              raw_url: rawUrl,
            },
          },
        }),
      [rawUrl]: () => new Response(JSON.stringify(THREAD), { status: 200 }),
    });
    const reader = new GistThreadReader({ fetch });

    const thread = await reader.read({
      id: GIST_ID,
      filename: "browser-use.json",
    });

    expect(thread.title).toBe("Browser use");
    // API call + raw fallback.
    expect(calls.map((c) => c.url)).toEqual([
      `https://api.github.com/gists/${GIST_ID}`,
      rawUrl,
    ]);
  });

  test("reads anonymously without an Authorization header", async () => {
    const gistBody = {
      id: GIST_ID,
      files: {
        "t.json": { filename: "t.json", content: JSON.stringify(THREAD) },
      },
      history: [{ version: VERSION }],
    };
    const { fetch, calls } = _stubFetch({
      // resolveLatest hits the id; read then hits the pinned-version endpoint.
      [`https://api.github.com/gists/${GIST_ID}`]: () => _json(gistBody),
      [`https://api.github.com/gists/${GIST_ID}/${VERSION}`]: () =>
        _json(gistBody),
    });

    await readLatestThread(new GistThreadReader({ fetch }), GIST_ID);

    for (const call of calls) {
      const headers = new Headers(call.init?.headers);
      expect(headers.has("Authorization")).toBe(false);
    }
  });

  test("throws a descriptive error on rate limit (403)", async () => {
    const { fetch } = _stubFetch({
      [`https://api.github.com/gists/${GIST_ID}`]: () =>
        _json({ message: "rate limited" }, 403),
    });
    const reader = new GistThreadReader({ fetch });

    let error: unknown;
    try {
      await reader.resolveLatest(GIST_ID);
    } catch (e) {
      error = e;
    }
    expect((error as Error | undefined)?.message).toMatch(/rate limit/i);
  });
});
