import { describe, expect, test } from "bun:test";

import { readSshRemoteRuntimeConfig } from "./ssh-bootstrap-config";

describe("readSshRemoteRuntimeConfig", () => {
  test("returns null when disabled or not ssh bootstrap", () => {
    expect(readSshRemoteRuntimeConfig({})).toBeNull();
    expect(
      readSshRemoteRuntimeConfig({ LLM_SPACE_ENABLE_REMOTE_RUNTIME: "1" })
    ).toBeNull();
  });

  test("requires host", () => {
    expect(() =>
      readSshRemoteRuntimeConfig({
        LLM_SPACE_ENABLE_REMOTE_RUNTIME: "1",
        LLM_SPACE_REMOTE_BOOTSTRAP: "ssh",
      })
    ).toThrow("LLM_SPACE_REMOTE_SSH_HOST is required");
  });

  test("builds default ssh config", () => {
    expect(
      readSshRemoteRuntimeConfig({
        LLM_SPACE_ENABLE_REMOTE_RUNTIME: "1",
        LLM_SPACE_REMOTE_BOOTSTRAP: "ssh",
        LLM_SPACE_REMOTE_SSH_HOST: "host",
        LLM_SPACE_REMOTE_REPO: "/repo",
        LLM_SPACE_ACTIVE_RUNTIME_ID: "remote:ssh-manual",
      })
    ).toMatchObject({
      id: "remote:ssh-manual",
      name: "SSH host",
      host: "host",
      remoteRepo: "/repo",
      remoteInstallDir: "~/.llm-space/remote-runtime",
      remoteHome: "~/.llm-space-server",
      remoteServerPort: 39123,
      makeDefault: true,
    });
  });

  test("rejects invalid runtime id and ports", () => {
    expect(() =>
      readSshRemoteRuntimeConfig({
        LLM_SPACE_ENABLE_REMOTE_RUNTIME: "1",
        LLM_SPACE_REMOTE_BOOTSTRAP: "ssh",
        LLM_SPACE_REMOTE_SSH_HOST: "host",
        LLM_SPACE_REMOTE_REPO: "/repo",
        LLM_SPACE_REMOTE_RUNTIME_ID: "local",
      })
    ).toThrow("must start with 'remote:'");
    expect(() =>
      readSshRemoteRuntimeConfig({
        LLM_SPACE_ENABLE_REMOTE_RUNTIME: "1",
        LLM_SPACE_REMOTE_BOOTSTRAP: "ssh",
        LLM_SPACE_REMOTE_SSH_HOST: "host",
        LLM_SPACE_REMOTE_REPO: "/repo",
        LLM_SPACE_REMOTE_SSH_PORT: "bad",
      })
    ).toThrow("must be an integer");
  });
});
