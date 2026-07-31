import { describe, expect, test } from "bun:test";

import { fetchGithubUser } from "./github-device-flow";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function _deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function _captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("Expected promise to reject");
  } catch (error) {
    return error;
  }
}

describe("fetchGithubUser", () => {
  test("preserves AbortError when fallback email lookup is cancelled", async () => {
    const emailRequestStarted = _deferred<void>();
    const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url === "https://api.github.com/user") {
        return Promise.resolve(
          Response.json({
            login: "octocat",
            name: "The Octocat",
            email: null,
            avatar_url: "https://avatars.githubusercontent.com/u/583231",
            html_url: "https://github.com/octocat",
          })
        );
      }
      if (url === "https://api.github.com/user/emails") {
        emailRequestStarted.resolve(undefined);
        const signal = init?.signal;
        if (!signal) {
          return Promise.reject(new Error("Fallback email request has no signal"));
        }
        return new Promise<Response>((_resolve, reject) => {
          const rejectAbort = () =>
            reject(new DOMException("The operation was aborted.", "AbortError"));
          if (signal.aborted) {
            rejectAbort();
          } else {
            signal.addEventListener("abort", rejectAbort, { once: true });
          }
        });
      }
      return Promise.reject(new Error(`Unexpected GitHub URL: ${url}`));
    }) as typeof fetch;
    const controller = new AbortController();
    const rejection = _captureRejection(
      fetchGithubUser("test-token", controller.signal, fetchImpl)
    );

    await emailRequestStarted.promise;
    controller.abort();

    expect(await rejection).toMatchObject({ name: "AbortError" });
  });
});
