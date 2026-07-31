import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { SshRemoteRuntimeConfig } from "./ssh-bootstrap-config";
import {
  buildRemoteServerCommand,
  buildRemoteServerArgs,
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

const SENTINEL_TOKEN = "sentinel-runtime-token-do-not-leak";

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

  test("keeps the packaged runtime token out of local and remote argv", () => {
    expect(shellQuote("a'b$c")).toBe("'a'\\''b$c'");
    const sshArgs = buildRemoteServerArgs({
      config: CONFIG,
      entrypoint: "/opt/llm space/server/bin/llm-space-server",
    });
    const command = sshArgs.at(-1) ?? "";

    expect(command).not.toContain("--token ");
    expect(command).toContain("--token-stdin");
    expect(command).toContain(
      "exec '/opt/llm space/server/bin/llm-space-server'"
    );
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

  test("keeps the source runtime token out of remote argv", () => {
    const command = buildSourceRemoteServerCommand({
      remoteRepo: "/repo path/llm-space",
      host: "127.0.0.1",
      port: 39123,
      home: "/tmp/home path",
    });
    expect(command).not.toContain("--token ");
    expect(command).toContain("--token-stdin");
    expect(command).toContain("cd '/repo path/llm-space'");
    expect(command).toContain("exec bun apps/server/src/index.ts");
    expect(command).not.toContain("--filter");
  });

  test.each(["installed", "source"] as const)(
    "keeps the protected token out of the executed %s runtime argv",
    async (mode) => {
      const result = await _captureExecutedRuntime(mode);

      expect(result.localShellArgv.join("\0")).not.toContain(SENTINEL_TOKEN);
      expect(result.remoteArgv.join("\0")).not.toContain(SENTINEL_TOKEN);
      expect(result.remoteArgv).toContain("--token-stdin");
      expect(result.receivedToken).toBe(SENTINEL_TOKEN);
    }
  );

  test("expands source mode tilde paths", () => {
    const command = buildSourceRemoteServerCommand({
      remoteRepo: "~/repo/llm-space",
      host: "127.0.0.1",
      port: 39123,
      home: "~/.llm-space-server",
    });

    expect(command).toContain('cd "$HOME"/'.concat("'repo/llm-space'"));
    expect(command).toContain('--home "$HOME"/'.concat("'.llm-space-server'"));
  });
});

async function _captureExecutedRuntime(mode: "installed" | "source"): Promise<{
  localShellArgv: string[];
  remoteArgv: string[];
  receivedToken: string;
}> {
  const directory = await mkdtemp(
    path.join(tmpdir(), "llm-space-runtime-argv-")
  );
  const argvPath = path.join(directory, "argv");
  const tokenPath = path.join(directory, "token");
  const executablePath = path.join(
    directory,
    mode === "source" ? "bun" : "server"
  );
  const script = `#!/bin/sh\numask 077\nprintf '%s\\n' "$@" > "$ARGV_CAPTURE"\nIFS= read -r token\nprintf '%s' "$token" > "$TOKEN_CAPTURE"\n`;

  try {
    await writeFile(executablePath, script, { encoding: "utf8", mode: 0o700 });
    await chmod(executablePath, 0o700);
    const repositoryPath = path.join(directory, "repo");
    await mkdir(repositoryPath, { mode: 0o700 });
    const command =
      mode === "source"
        ? buildSourceRemoteServerCommand({
            remoteRepo: repositoryPath,
            host: "127.0.0.1",
            port: 39123,
            home: path.join(directory, "home"),
          })
        : buildRemoteServerCommand({
            entrypoint: executablePath,
            host: "127.0.0.1",
            port: 39123,
            home: path.join(directory, "home"),
          });
    const child = spawn("/bin/sh", ["-c", command], {
      env: {
        ...process.env,
        ARGV_CAPTURE: argvPath,
        TOKEN_CAPTURE: tokenPath,
        PATH: `${directory}:${process.env.PATH ?? ""}`,
      },
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.stdin?.end(`${SENTINEL_TOKEN}\n`);
    const [exitCode] = (await once(child, "exit")) as [number | null];
    expect(exitCode, stderr).toBe(0);

    return {
      localShellArgv: child.spawnargs,
      remoteArgv: (await readFile(argvPath, "utf8")).trimEnd().split("\n"),
      receivedToken: await readFile(tokenPath, "utf8"),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
