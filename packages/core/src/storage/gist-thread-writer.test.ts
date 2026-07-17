import { describe, expect, test } from "bun:test";

import type { Thread } from "../types/threads/thread";

import { GistThreadWriter } from "./gist-thread-writer";

const GIST_ID = "113dadfadb8a0839de50e882f82b17dd";
const NEW_VERSION = "ffffffffffffffffffffffffffffffffffffffff";
const THREAD: Thread = { title: "Browser Use!" };

interface StubCall {
  url: string;
  method: string;
  body: unknown;
  headers: Headers;
}

/**
 * A fetch stub routed by `"METHOD url"` so GET (resolve) and PATCH (update) to
 * the same gist endpoint are distinguishable. Records every call.
 */
function _stubFetch(
  routes: Record<string, () => Response>
): { fetch: typeof fetch; calls: StubCall[] } {
  const calls: StubCall[] = [];
  const fetchImpl = ((input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({
      url,
      method,
      body: init?.body
        ? (JSON.parse(init.body as string) as unknown)
        : undefined,
      headers: new Headers(init?.headers),
    });
    const route = routes[`${method} ${url}`];
    if (!route) throw new Error(`Unexpected fetch: ${method} ${url}`);
    return Promise.resolve(route());
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

function _json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("GistThreadWriter.write (create)", () => {
  test("POSTs a new secret gist with a slugified .json filename", async () => {
    const { fetch, calls } = _stubFetch({
      "POST https://api.github.com/gists": () =>
        _json({ id: GIST_ID, history: [{ version: NEW_VERSION }] }),
    });
    const writer = new GistThreadWriter({ fetch, getToken: () => "tok" });

    const locator = await writer.write(THREAD);

    expect(locator).toEqual({
      id: GIST_ID,
      filename: "browser-use.json",
      version: NEW_VERSION,
    });

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.method).toBe("POST");
    expect(call.headers.get("Authorization")).toBe("Bearer tok");
    expect(call.body).toMatchObject({
      public: false,
      files: { "browser-use.json": { content: expect.any(String) as unknown } },
    });
  });

  test("respects public: true", async () => {
    const { fetch, calls } = _stubFetch({
      "POST https://api.github.com/gists": () =>
        _json({ id: GIST_ID, history: [{ version: NEW_VERSION }] }),
    });
    const writer = new GistThreadWriter({
      fetch,
      getToken: () => "tok",
      public: true,
    });

    await writer.write(THREAD);

    expect((calls[0]!.body as { public: boolean }).public).toBe(true);
  });

  test("falls back to thread.json when the title has no slug", async () => {
    const { fetch, calls } = _stubFetch({
      "POST https://api.github.com/gists": () =>
        _json({ id: GIST_ID, history: [{ version: NEW_VERSION }] }),
    });
    const writer = new GistThreadWriter({ fetch, getToken: () => "tok" });

    await writer.write({ title: "  !!!  " });

    expect(calls[0]!.body).toMatchObject({
      files: { "thread.json": { content: expect.any(String) as unknown } },
    });
  });
});

describe("GistThreadWriter.write (update)", () => {
  test("PATCHes the existing gist, reusing the resolved filename", async () => {
    const { fetch, calls } = _stubFetch({
      [`GET https://api.github.com/gists/${GIST_ID}`]: () =>
        _json({
          id: GIST_ID,
          files: { "original.json": { filename: "original.json" } },
          history: [{ version: "old" }],
        }),
      [`PATCH https://api.github.com/gists/${GIST_ID}`]: () =>
        _json({ id: GIST_ID, history: [{ version: NEW_VERSION }] }),
    });
    const writer = new GistThreadWriter({ fetch, getToken: () => "tok" });

    const locator = await writer.write(THREAD, GIST_ID);

    expect(locator).toEqual({
      id: GIST_ID,
      filename: "original.json",
      version: NEW_VERSION,
    });

    const patchCall = calls.find((c) => c.method === "PATCH")!;
    expect(patchCall.headers.get("Authorization")).toBe("Bearer tok");
    // Overwrites the existing file rather than creating a title-derived one.
    expect(patchCall.body).toMatchObject({
      files: { "original.json": { content: expect.any(String) as unknown } },
    });
  });
});

describe("GistThreadWriter.write (auth)", () => {
  test("throws when no token is available", async () => {
    const { fetch } = _stubFetch({});
    const writer = new GistThreadWriter({ fetch, getToken: () => null });

    let error: unknown;
    try {
      await writer.write(THREAD);
    } catch (e) {
      error = e;
    }
    expect((error as Error | undefined)?.message).toMatch(/sign-in required/i);
  });
});
