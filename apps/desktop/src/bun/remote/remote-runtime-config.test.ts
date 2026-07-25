import { describe, expect, test } from "bun:test";

import { readManualRemoteRuntimeConfig } from "./remote-runtime-config";

describe("readManualRemoteRuntimeConfig", () => {
  test("returns null when feature flag is not enabled", () => {
    expect(readManualRemoteRuntimeConfig({})).toBeNull();
  });

  test("requires URL and token when enabled", () => {
    expect(() =>
      readManualRemoteRuntimeConfig({ LLM_SPACE_ENABLE_REMOTE_RUNTIME: "1" })
    ).toThrow("LLM_SPACE_REMOTE_RUNTIME_URL is required");
    expect(() =>
      readManualRemoteRuntimeConfig({
        LLM_SPACE_ENABLE_REMOTE_RUNTIME: "1",
        LLM_SPACE_REMOTE_RUNTIME_URL: "http://127.0.0.1:39123",
      })
    ).toThrow("LLM_SPACE_REMOTE_RUNTIME_TOKEN is required");
  });

  test("builds the default manual remote config", () => {
    expect(
      readManualRemoteRuntimeConfig({
        LLM_SPACE_ENABLE_REMOTE_RUNTIME: "true",
        LLM_SPACE_REMOTE_RUNTIME_URL: "http://127.0.0.1:39123",
        LLM_SPACE_REMOTE_RUNTIME_TOKEN: "test-token",
        LLM_SPACE_ACTIVE_RUNTIME_ID: "remote:manual",
      })
    ).toEqual({
      id: "remote:manual",
      name: "Manual Remote",
      baseUrl: "http://127.0.0.1:39123",
      token: "test-token",
      makeDefault: true,
    });
  });

  test("rejects non-remote ids", () => {
    expect(() =>
      readManualRemoteRuntimeConfig({
        LLM_SPACE_ENABLE_REMOTE_RUNTIME: "1",
        LLM_SPACE_REMOTE_RUNTIME_URL: "http://127.0.0.1:39123",
        LLM_SPACE_REMOTE_RUNTIME_TOKEN: "test-token",
        LLM_SPACE_REMOTE_RUNTIME_ID: "local",
      })
    ).toThrow("must start with 'remote:'");
  });
});
