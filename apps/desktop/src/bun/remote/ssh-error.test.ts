import { describe, expect, test } from "bun:test";

import {
  formatSshBootstrapFailure,
  parseMissingRuntimeBinaryFailure,
  parseRemotePortInUseFailure,
} from "./ssh-error";

describe("formatSshBootstrapFailure", () => {
  test("classifies OpenSSH host key failures", () => {
    const message = formatSshBootstrapFailure({
      stage: "tunnel-start",
      label: "ssh tunnel",
      target: "user@host1",
      output: `REMOTE HOST IDENTIFICATION HAS CHANGED!
IT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!
Offending ECDSA key in /Users/bytedance/.ssh/known_hosts:6
Error: forwarding disabled due to host key check failure`,
    });

    expect(message).toContain(
      "SSH host key verification failed for user@host1"
    );
    expect(message).toContain("/Users/bytedance/.ssh/known_hosts line 6");
    expect(message).toContain(
      "After confirming it is safe, remove that stale known_hosts entry and reconnect."
    );
    expect(message).toContain("port forwarding was disabled");
    expect(message).not.toContain("REMOTE HOST IDENTIFICATION HAS CHANGED");
  });

  test("gives first-time host key failures a terminal trust action", () => {
    const message = formatSshBootstrapFailure({
      stage: "health-check",
      label: "ssh tunnel",
      target: "user@203.0.113.10",
      output: "Host key verification failed.",
    });

    expect(message).toContain(
      "SSH host key verification failed for user@203.0.113.10"
    );
    expect(message).toContain("run ssh user@203.0.113.10 once in Terminal");
  });

  test("describes host key impact by bootstrap stage", () => {
    const output = `REMOTE HOST IDENTIFICATION HAS CHANGED!
Offending ECDSA key in /Users/bytedance/.ssh/known_hosts:6`;

    expect(
      formatSshBootstrapFailure({
        stage: "server-start",
        label: "remote server",
        output,
      })
    ).toContain("the remote runtime command was not started");
    expect(
      formatSshBootstrapFailure({
        stage: "health-check",
        label: "ssh tunnel",
        output,
      })
    ).toContain("closed before LLM Space could verify the remote runtime");
  });

  test("keeps generic ssh failures concise", () => {
    const message = formatSshBootstrapFailure({
      stage: "server-start",
      label: "remote server",
      output: "bash: bun: command not found",
    });

    expect(message).toBe(
      "SSH remote runtime bootstrap failed during server-start: remote server exited early. bash: bun: command not found"
    );
  });

  test("classifies missing remote runtime binaries", () => {
    const message = formatSshBootstrapFailure({
      stage: "health-check",
      label: "remote server",
      output:
        "bash: line 1: /home/user/.llm-space/remote-runtime/versions/4.4.4/bin/llm-space-server: No such file or directory",
    });

    expect(message).toContain("Remote runtime binary is missing");
    expect(message).toContain(
      "/home/user/.llm-space/remote-runtime/versions/4.4.4/bin/llm-space-server"
    );
    expect(message).toContain("literal '~' directory");
    expect(message).not.toContain("will reinstall");
    expect(message).not.toContain("health-check");
  });

  test("parses missing remote runtime binary failures", () => {
    expect(
      parseMissingRuntimeBinaryFailure(
        "bash: line 1: /home/user/.llm-space/remote-runtime/versions/4.4.4/bin/llm-space-server: No such file or directory"
      )
    ).toEqual({
      path: "/home/user/.llm-space/remote-runtime/versions/4.4.4/bin/llm-space-server",
      reason: "missing",
    });
  });

  test("parses non-executable remote runtime binary failures", () => {
    expect(
      parseMissingRuntimeBinaryFailure(
        "bash: line 1: /home/user/.llm-space/remote-runtime/versions/4.4.4/bin/llm-space-server: Permission denied"
      )
    ).toEqual({
      path: "/home/user/.llm-space/remote-runtime/versions/4.4.4/bin/llm-space-server",
      reason: "not-executable",
    });
  });

  test("parses remote runtime port-in-use failures", () => {
    expect(
      parseRemotePortInUseFailure(
        "SSH remote runtime bootstrap failed during health-check: remote server exited early. Failed to start server. Is port 39123 in use?"
      )
    ).toEqual({ port: 39123 });
    expect(
      parseRemotePortInUseFailure(
        "EADDRINUSE: address already in use 127.0.0.1:39123"
      )
    ).toEqual({ port: 39123 });
  });

  test("formats remote runtime port-in-use failures", () => {
    const message = formatSshBootstrapFailure({
      stage: "health-check",
      label: "remote server",
      output: "Failed to start server. Is port 39123 in use?",
    });

    expect(message).toContain("Remote runtime port 39123 is already in use");
    expect(message).toContain("stale llm-space-server process");
  });

  test("classifies authentication failures", () => {
    const message = formatSshBootstrapFailure({
      stage: "server-install",
      label: "remote server installer",
      target: "user@host1",
      output:
        "user@host1: Permission denied (publickey,password,keyboard-interactive).",
    });

    expect(message).toContain("SSH authentication failed for user@host1");
    expect(message).toContain("~/.ssh/config");
    expect(message).toContain("ssh-agent");
  });

  test("does not classify remote filesystem permission errors as authentication", () => {
    const message = formatSshBootstrapFailure({
      stage: "server-install",
      label: "remote server installer",
      target: "user@host1",
      output:
        "mkdir: cannot create directory '/opt/llm-space': Permission denied",
    });

    expect(message).not.toContain("SSH authentication failed");
    expect(message).toContain("SSH remote runtime bootstrap failed");
  });
});
