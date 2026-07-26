import { describe, expect, test } from "bun:test";

import type { SshRemoteRuntimeConfig } from "./ssh-bootstrap-config";
import {
  buildRemoteServerCommand,
  buildSourceRemoteServerCommand,
  buildSshBaseArgs,
  buildSshTarget,
  buildTunnelArgs,
  joinRemotePath,
  shellPath,
  shellQuote,
} from "./ssh-command";

const CONFIG: SshRemoteRuntimeConfig = {
  id: "remote:ssh-manual",
  name: "SSH host",
  host: "host",
  user: "user",
  port: 2222,
  identityFile: "/key file",
  extraArgs: ["-J", "jump"],
  remoteRepo: "/repo path/llm-space",
  remoteInstallDir: "/opt/llm-space/runtime",
  remoteHome: "/tmp/home path",
  remoteServerPort: 39123,
  makeDefault: true,
};

describe("ssh command builders", () => {
  test("builds target and base args", () => {
    expect(buildSshTarget(CONFIG)).toBe("user@host");
    expect(buildSshBaseArgs(CONFIG)).toEqual([
      "-p",
      "2222",
      "-o",
      "ServerAliveInterval=15",
      "-o",
      "ServerAliveCountMax=2",
      "-i",
      "/key file",
      "-J",
      "jump",
      "user@host",
    ]);
  });

  test("does not override OpenSSH config by default", () => {
    const args = buildSshBaseArgs({
      ...CONFIG,
      host: "devbox",
      user: undefined,
      port: undefined,
      identityFile: undefined,
      extraArgs: [],
    });

    expect(buildSshTarget({ ...CONFIG, host: "devbox", user: undefined })).toBe(
      "devbox"
    );
    expect(args).toEqual([
      "-o",
      "ServerAliveInterval=15",
      "-o",
      "ServerAliveCountMax=2",
      "devbox",
    ]);
    expect(args).not.toContain("-p");
    expect(args).not.toContain("22");
    expect(args).not.toContain("-i");
    expect(args).not.toContain("BatchMode=yes");
  });

  test("builds tunnel args with ExitOnForwardFailure", () => {
    expect(buildTunnelArgs({ config: CONFIG, localPort: 40000 })).toContain(
      "ExitOnForwardFailure=yes"
    );
    expect(buildTunnelArgs({ config: CONFIG, localPort: 40000 })).toContain(
      "127.0.0.1:40000:127.0.0.1:39123"
    );
  });

  test("shell quotes remote server command", () => {
    expect(shellQuote("a'b$c")).toBe("'a'\\''b$c'");
    const command = buildRemoteServerCommand({
      entrypoint: "/opt/llm space/server/bin/llm-space-server",
      host: "127.0.0.1",
      port: 39123,
      token: "tok'en$;",
      home: "/tmp/home path",
    });
    expect(command).toContain(
      "exec '/opt/llm space/server/bin/llm-space-server'"
    );
    expect(command).toContain("--token 'tok'\\''en$;'");
    expect(command).toContain("--home '/tmp/home path'");
  });

  test("expands current-user tilde paths on the remote shell", () => {
    expect(shellPath("~")).toBe('"$HOME"');
    expect(shellPath("~/.llm-space/remote runtime")).toBe(
      '"$HOME"/'.concat("'.llm-space/remote runtime'")
    );

    const command = buildRemoteServerCommand({
      entrypoint:
        "~/.llm-space/remote-runtime/versions/4.4.4/bin/llm-space-server",
      host: "127.0.0.1",
      port: 39123,
      token: "token",
      home: "~/.llm-space-server",
    });

    expect(command).toContain(
      'exec "$HOME"/'.concat(
        "'.llm-space/remote-runtime/versions/4.4.4/bin/llm-space-server'"
      )
    );
    expect(command).toContain('--home "$HOME"/'.concat("'.llm-space-server'"));
    expect(command).not.toContain("exec '~/.llm-space");
    expect(command).not.toContain("--home '~/.llm-space-server'");
  });

  test("joins remote paths without changing tilde semantics", () => {
    expect(
      joinRemotePath("~/.llm-space/remote-runtime", "versions", "v1")
    ).toBe("~/.llm-space/remote-runtime/versions/v1");
    expect(joinRemotePath("/opt/runtime/", "/versions/", "v1/")).toBe(
      "/opt/runtime/versions/v1"
    );
  });

  test("rejects non-string shell quote input with clear error", () => {
    expect(() => shellQuote(undefined)).toThrow(
      "Cannot shell-quote non-string value: undefined"
    );
  });

  test("keeps source mode as legacy fallback", () => {
    const command = buildSourceRemoteServerCommand({
      remoteRepo: "/repo path/llm-space",
      host: "127.0.0.1",
      port: 39123,
      token: "token",
      home: "/tmp/home path",
    });
    expect(command).toContain("cd '/repo path/llm-space'");
    expect(command).toContain("exec bun --filter @llm-space/server dev --");
  });

  test("expands source mode tilde paths", () => {
    const command = buildSourceRemoteServerCommand({
      remoteRepo: "~/repo/llm-space",
      host: "127.0.0.1",
      port: 39123,
      token: "token",
      home: "~/.llm-space-server",
    });

    expect(command).toContain('cd "$HOME"/'.concat("'repo/llm-space'"));
    expect(command).toContain('--home "$HOME"/'.concat("'.llm-space-server'"));
  });
});
