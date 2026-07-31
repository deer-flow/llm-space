import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  AuthConfig,
  GithubAuthState,
  GithubUser,
} from "../../shared/auth";

import {
  GitHubAuthManager,
  type GitHubDeviceFlow,
  type GitHubAuthManagerOptions,
} from "./github-auth-manager";
import type {
  AccessTokenResponse,
  DeviceCodeResponse,
} from "./github-device-flow";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

interface ProfileRequest {
  accessToken: string;
  signal: AbortSignal;
  deferred: Deferred<GithubUser>;
}

class NonAbortingAbortController extends AbortController {
  override abort(reason?: unknown): void {
    void reason;
  }
}

const DEVICE_CODES: DeviceCodeResponse[] = [];
const PROFILE_REQUESTS: ProfileRequest[] = [];
const TOKENS: AccessTokenResponse[] = [];

const DEVICE_FLOW: GitHubDeviceFlow = {
  fetchGithubUser: (accessToken, signal) => {
    const deferred = _deferred<GithubUser>();
    PROFILE_REQUESTS.push({ accessToken, signal, deferred });
    return deferred.promise;
  },
  pollForAccessToken: () => {
    const token = TOKENS.shift();
    if (!token) throw new Error("No token queued for Device Flow test.");
    return Promise.resolve(token);
  },
  requestDeviceCode: () => {
    const device = DEVICE_CODES.shift();
    if (!device) throw new Error("No device code queued for Device Flow test.");
    return Promise.resolve(device);
  },
};

const ORIGINAL_HOME = process.env.LLM_SPACE_HOME;
const TEMP_DIRS: string[] = [];

beforeEach(() => {
  DEVICE_CODES.splice(0, DEVICE_CODES.length, _deviceCode("FIRST"));
  PROFILE_REQUESTS.length = 0;
  TOKENS.splice(0, TOKENS.length, _token("first-token"));
});

afterEach(async () => {
  process.env.LLM_SPACE_HOME = ORIGINAL_HOME;
  await Promise.all(
    TEMP_DIRS.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

function _deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function _deviceCode(userCode: string): DeviceCodeResponse {
  return {
    deviceCode: `${userCode.toLowerCase()}-device-code`,
    userCode,
    verificationUri: "https://github.com/login/device",
    verificationUriComplete: `https://github.com/login/device?user_code=${userCode}`,
    expiresIn: 900,
    interval: 1,
  };
}

function _token(accessToken: string): AccessTokenResponse {
  return { accessToken, tokenType: "bearer", scope: "gist" };
}

function _queueTwoFlows(): void {
  DEVICE_CODES.splice(
    0,
    DEVICE_CODES.length,
    _deviceCode("FIRST"),
    _deviceCode("SECOND")
  );
  TOKENS.splice(
    0,
    TOKENS.length,
    _token("first-token"),
    _token("second-token")
  );
}

function _user(login: string): GithubUser {
  return {
    login,
    name: `${login} name`,
    email: `${login}@example.com`,
    avatarUrl: `https://avatars.githubusercontent.com/${login}`,
    htmlUrl: `https://github.com/${login}`,
  };
}

async function _createManager(
  options: Pick<GitHubAuthManagerOptions, "createAbortController"> = {}
): Promise<{
  authPath: string;
  manager: GitHubAuthManager;
  states: GithubAuthState[];
}> {
  const home = await mkdtemp(path.join(os.tmpdir(), "llm-space-auth-"));
  TEMP_DIRS.push(home);
  process.env.LLM_SPACE_HOME = home;
  const states: GithubAuthState[] = [];
  return {
    authPath: path.join(home, "settings", "auth.json"),
    manager: new GitHubAuthManager({
      ...options,
      deviceFlow: DEVICE_FLOW,
      onChange: (state) => states.push(state),
    }),
    states,
  };
}

async function _waitForProfileRequest(index = 0): Promise<ProfileRequest> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const request = PROFILE_REQUESTS[index];
    if (request) return request;
    await Promise.resolve();
  }
  throw new Error("Device Flow did not start the profile request.");
}

describe("GitHubAuthManager", () => {
  test("cancelling a delayed profile request keeps auth signed out and unpersisted", async () => {
    const { authPath, manager, states } = await _createManager();

    const signIn = manager.signIn();
    const profile = await _waitForProfileRequest();

    manager.signOut();
    expect(profile.signal.aborted).toBe(true);

    profile.deferred.resolve(_user("late-user"));
    await signIn;

    expect(manager.getState()).toEqual({ status: "signedOut" });
    expect(manager.getAccessToken()).toBeNull();
    expect(existsSync(authPath)).toBe(false);
    expect(states.some((state) => state.status === "signedIn")).toBe(false);
  });

  test("a stale flow cannot clear its replacement's pending state", async () => {
    _queueTwoFlows();
    const { authPath, manager } = await _createManager();

    const firstSignIn = manager.signIn();
    const firstProfile = await _waitForProfileRequest(0);
    manager.signOut();

    const secondSignIn = manager.signIn();
    const secondProfile = await _waitForProfileRequest(1);

    firstProfile.deferred.resolve(_user("stale-user"));
    await firstSignIn;

    expect(manager.getState()).toEqual({
      status: "signingIn",
      userCode: "SECOND",
      verificationUri: "https://github.com/login/device",
    });
    expect(manager.getAccessToken()).toBeNull();
    expect(existsSync(authPath)).toBe(false);

    const currentUser = _user("current-user");
    secondProfile.deferred.resolve(currentUser);
    await secondSignIn;

    expect(manager.getState()).toEqual({ status: "signedIn", user: currentUser });
    expect(manager.getAccessToken()).toBe("second-token");
    expect(JSON.parse(await readFile(authPath, "utf8")) as AuthConfig).toEqual({
      accessToken: "second-token",
      tokenType: "bearer",
      scope: "gist",
      user: currentUser,
    });
  });

  test("a stale flow cannot overwrite its replacement's credentials", async () => {
    _queueTwoFlows();
    const { authPath, manager } = await _createManager();

    const firstSignIn = manager.signIn();
    const firstProfile = await _waitForProfileRequest(0);
    manager.signOut();

    const secondSignIn = manager.signIn();
    const secondProfile = await _waitForProfileRequest(1);
    const currentUser = _user("current-user");
    secondProfile.deferred.resolve(currentUser);
    await secondSignIn;

    firstProfile.deferred.resolve(_user("stale-user"));
    await firstSignIn;

    expect(manager.getState()).toEqual({ status: "signedIn", user: currentUser });
    expect(manager.getAccessToken()).toBe("second-token");
    expect(JSON.parse(await readFile(authPath, "utf8")) as AuthConfig).toEqual({
      accessToken: "second-token",
      tokenType: "bearer",
      scope: "gist",
      user: currentUser,
    });
  });

  test("controller identity rejects a non-current flow with an active signal", async () => {
    _queueTwoFlows();
    const controllers: AbortController[] = [
      new NonAbortingAbortController(),
      new AbortController(),
    ];
    const { authPath, manager } = await _createManager({
      createAbortController: () => {
        const controller = controllers.shift();
        if (!controller) {
          throw new Error("No AbortController queued for Device Flow test.");
        }
        return controller;
      },
    });

    const firstSignIn = manager.signIn();
    const firstProfile = await _waitForProfileRequest(0);
    manager.cancelSignIn();
    expect(firstProfile.signal.aborted).toBe(false);

    const secondSignIn = manager.signIn();
    const secondProfile = await _waitForProfileRequest(1);
    firstProfile.deferred.resolve(_user("stale-user"));
    await firstSignIn;

    expect(manager.getState()).toEqual({
      status: "signingIn",
      userCode: "SECOND",
      verificationUri: "https://github.com/login/device",
    });
    expect(manager.getAccessToken()).toBeNull();
    expect(existsSync(authPath)).toBe(false);

    const currentUser = _user("current-user");
    secondProfile.deferred.resolve(currentUser);
    await secondSignIn;
    expect(manager.getState()).toEqual({ status: "signedIn", user: currentUser });
    expect(manager.getAccessToken()).toBe("second-token");
  });
});
