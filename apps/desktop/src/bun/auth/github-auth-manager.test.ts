import { afterEach, describe, expect, mock, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { GithubAuthState, GithubUser } from "../../shared/auth";

class TestDeviceFlowError extends Error {}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

interface ProfileRequest {
  accessToken: string;
  signal: AbortSignal | undefined;
  deferred: Deferred<GithubUser>;
}

const PROFILE_REQUESTS: ProfileRequest[] = [];

const TOKENS = [
  { accessToken: "cancelled-token", tokenType: "bearer", scope: "gist" },
];

function _deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

await mock.module("./github-device-flow", () => ({
  DeviceFlowError: TestDeviceFlowError,
  fetchGithubUser: (accessToken: string, signal?: AbortSignal) => {
    const deferred = _deferred<GithubUser>();
    PROFILE_REQUESTS.push({ accessToken, signal, deferred });
    return deferred.promise;
  },
  pollForAccessToken: () => {
    const token = TOKENS.shift();
    if (!token) throw new Error("No token queued for Device Flow test.");
    return Promise.resolve(token);
  },
  requestDeviceCode: () =>
    Promise.resolve({
      deviceCode: "device-code",
      userCode: "USER-CODE",
      verificationUri: "https://github.com/login/device",
      verificationUriComplete: "https://github.com/login/device?user_code=USER-CODE",
      expiresIn: 900,
      interval: 1,
    }),
}));

const { GitHubAuthManager } = await import("./github-auth-manager");

const ORIGINAL_HOME = process.env.LLM_SPACE_HOME;
const TEMP_DIRS: string[] = [];

afterEach(async () => {
  process.env.LLM_SPACE_HOME = ORIGINAL_HOME;
  PROFILE_REQUESTS.length = 0;
  TOKENS.splice(0, TOKENS.length, {
    accessToken: "cancelled-token",
    tokenType: "bearer",
    scope: "gist",
  });
  await Promise.all(
    TEMP_DIRS.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

async function _waitForProfileRequest(): Promise<ProfileRequest> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const request = PROFILE_REQUESTS.at(-1);
    if (request) return request;
    await Promise.resolve();
  }
  throw new Error("Device Flow did not start the profile request.");
}

describe("GitHubAuthManager", () => {
  test("cancelling a delayed profile request keeps auth signed out and unpersisted", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "llm-space-auth-"));
    TEMP_DIRS.push(home);
    process.env.LLM_SPACE_HOME = home;
    const states: GithubAuthState[] = [];
    const manager = new GitHubAuthManager({
      onChange: (state) => states.push(state),
    });

    const signIn = manager.signIn();
    const profile = await _waitForProfileRequest();

    manager.signOut();
    expect(profile.signal?.aborted).toBe(true);

    profile.deferred.resolve({
      login: "late-user",
      name: "Late User",
      email: "late@example.com",
      avatarUrl: "https://avatars.githubusercontent.com/u/1",
      htmlUrl: "https://github.com/late-user",
    });
    await signIn;

    expect(manager.getState()).toEqual({ status: "signedOut" });
    expect(manager.getAccessToken()).toBeNull();
    expect(existsSync(path.join(home, "settings", "auth.json"))).toBe(false);
    expect(states.some((state) => state.status === "signedIn")).toBe(false);
  });
});
