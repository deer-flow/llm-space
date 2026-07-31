import { beforeEach, describe, expect, test } from "bun:test";

import type { ManagedProcess } from "./process-utils";
import { currentDesktopVersion } from "./server-package";
import type { SshRemoteRuntimeConfig } from "./ssh-bootstrap-config";
import { startSshRemoteRuntime } from "./ssh-remote-runtime";

let scenario:
  | "missing-runtime-binary"
  | "non-runtime-failure"
  | "port-in-use"
  | "port-in-use-unknown-owner"
  | "port-in-use-retry-fails"
  | "success";
let installCalls = 0;
let serverSpawnCalls = 0;
let stopCalls = 0;
let diagnosticCalls = 0;
let remoteExecCalls: string[] = [];
let spawnCalls: {
  label: string;
  command: string;
  args: string[];
  options?: { collectOutput?: boolean; stdinInput?: string };
}[] = [];

const SENTINEL_TOKEN = "sentinel-runtime-token-do-not-leak";

const CONFIG: SshRemoteRuntimeConfig = {
  id: "remote:test",
  name: "test",
  host: "host",
  extraArgs: ["-tt"],
  remoteRepo: "",
  remoteInstallDir: "~/.llm-space/remote-runtime",
  remoteHome: "~/.llm-space-server",
  remoteServerPort: 39123,
  makeDefault: false,
};

const TEST_DEPENDENCIES = {
  generateToken: () => SENTINEL_TOKEN,
  findFreePort: () => Promise.resolve(40000),
  installRemoteServerPackage: () => {
    installCalls += 1;
    return Promise.resolve({
      entrypoint: `/opt/runtime/versions/test-${installCalls}/bin/llm-space-server`,
      version: "test",
      platform: { os: "linux" as const, arch: "x64" as const },
    });
  },
  getOrDownloadServerPackage: () =>
    Promise.resolve({
      path: "/tmp/llm-space-server-test.tar.gz",
    }),
  uploadRemoteFile: () => Promise.resolve(),
  execRemoteCommand: (_config: SshRemoteRuntimeConfig, command: string) => {
    remoteExecCalls.push(command);
    if (command.includes("PIDS")) {
      return Promise.resolve({
        stdout:
          scenario === "port-in-use-unknown-owner"
            ? "PID=123\nARGS=python -m http.server 39123\n"
            : "PID=2067161\nARGS=/home/test/.llm-space/remote-runtime/versions/4.4.4/bin/llm-space-server --host 127.0.0.1 --port 39123\n",
        stderr: "",
      });
    }
    if (command.includes("kill -TERM")) {
      return Promise.resolve({ stdout: "", stderr: "" });
    }
    diagnosticCalls += 1;
    return Promise.resolve({
      stdout:
        "USER=test\nHOME=/home/test\nPWD=/home/test\nentrypoint_exists:1\nentrypoint_executable:1\n",
      stderr: "",
    });
  },
  spawnManagedProcess: (
    label: string,
    command: string,
    args: string[],
    options?: { collectOutput?: boolean; stdinInput?: string }
  ) => {
    spawnCalls.push({ label, command, args, options });
    const attempt = installCalls;
    if (label === "remote server") {
      serverSpawnCalls += 1;
    }
    const missing =
      label === "remote server" &&
      scenario === "missing-runtime-binary" &&
      attempt === 1;
    const nonRuntimeFailure =
      label === "remote server" &&
      scenario === "non-runtime-failure" &&
      attempt === 1;
    const portInUse =
      label === "remote server" &&
      (scenario === "port-in-use" ||
        scenario === "port-in-use-unknown-owner" ||
        scenario === "port-in-use-retry-fails") &&
      (serverSpawnCalls === 1 || scenario === "port-in-use-retry-fails");
    return {
      label,
      child: {
        exitCode: missing || nonRuntimeFailure || portInUse ? 127 : null,
        signalCode: null,
      },
      output: () =>
        missing
          ? "bash: line 1: /opt/runtime/versions/test/bin/llm-space-server: No such file or directory"
          : nonRuntimeFailure
            ? "bash: bun: command not found"
            : portInUse
              ? "Failed to start server. Is port 39123 in use?"
              : "",
      stop: () => {
        stopCalls += 1;
        return Promise.resolve();
      },
    } as unknown as ManagedProcess;
  },
};

beforeEach(() => {
  scenario = "missing-runtime-binary";
  installCalls = 0;
  serverSpawnCalls = 0;
  stopCalls = 0;
  diagnosticCalls = 0;
  remoteExecCalls = [];
  spawnCalls = [];
});

describe("startSshRemoteRuntime", () => {
  test.each(["installed", "source"] as const)(
    "passes the %s runtime token only through a closed stdin payload",
    async (mode) => {
      scenario = "success";
      const originalMode = process.env.LLM_SPACE_REMOTE_SERVER_MODE;
      if (mode === "source") {
        process.env.LLM_SPACE_REMOTE_SERVER_MODE = "source";
      } else {
        delete process.env.LLM_SPACE_REMOTE_SERVER_MODE;
      }

      try {
        await _withFetch(async () => {
          const handle = await startSshRemoteRuntime(CONFIG, {
            dependencies: TEST_DEPENDENCIES,
          });
          await handle.stop();
        });
      } finally {
        if (originalMode === undefined) {
          delete process.env.LLM_SPACE_REMOTE_SERVER_MODE;
        } else {
          process.env.LLM_SPACE_REMOTE_SERVER_MODE = originalMode;
        }
      }

      const serverSpawn = spawnCalls.find(
        (call) => call.label === "remote server"
      );
      expect(serverSpawn).toBeDefined();
      expect(serverSpawn?.command).toBe("ssh");
      expect(serverSpawn?.args.join("\0")).not.toContain(SENTINEL_TOKEN);
      const userTtyIndex = serverSpawn?.args.indexOf("-tt") ?? -1;
      const disableTtyIndex = serverSpawn?.args.indexOf("-T") ?? -1;
      const targetIndex = serverSpawn?.args.indexOf(CONFIG.host) ?? -1;
      expect(disableTtyIndex).toBeGreaterThan(userTtyIndex);
      expect(disableTtyIndex).toBeLessThan(targetIndex);
      expect(serverSpawn?.args.at(-1)).not.toContain("--token ");
      expect(serverSpawn?.args.at(-1)).toContain("--token-stdin");
      expect(serverSpawn?.options?.stdinInput).toBe(`${SENTINEL_TOKEN}\n`);
    }
  );

  test("does not reinstall when the runtime binary is missing", async () => {
    await startSshRemoteRuntime(CONFIG, {
      dependencies: TEST_DEPENDENCIES,
    }).then(
      () => {
        throw new Error("connect should fail");
      },
      (error) => {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).not.toContain(SENTINEL_TOKEN);
        expect((error as Error).message).toContain(
          "Remote runtime binary is missing"
        );
        expect((error as Error).message).toContain("Remote diagnostics:");
        expect((error as Error).message).toContain("entrypoint_exists:1");
        expect((error as Error).message).not.toContain("reinstall retry");
      }
    );

    expect(installCalls).toBe(1);
    expect(diagnosticCalls).toBe(1);
    expect(stopCalls).toBeGreaterThanOrEqual(1);
  });

  test("does not reinstall for non-runtime startup failures", async () => {
    scenario = "non-runtime-failure";

    await startSshRemoteRuntime(CONFIG, {
      dependencies: TEST_DEPENDENCIES,
    }).then(
      () => {
        throw new Error("connect should fail");
      },
      (error) => {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain(
          "bash: bun: command not found"
        );
      }
    );

    expect(installCalls).toBe(1);
    expect(diagnosticCalls).toBe(0);
  });

  test("stops a stale llm-space server and retries once when the remote port is in use", async () => {
    scenario = "port-in-use";

    await _withFetch(async () => {
      const handle = await startSshRemoteRuntime(CONFIG, {
        dependencies: TEST_DEPENDENCIES,
      });
      await handle.stop();
    });

    expect(installCalls).toBe(1);
    expect(serverSpawnCalls).toBe(2);
    const serverSpawns = spawnCalls.filter(
      (call) => call.label === "remote server"
    );
    expect(serverSpawns).toHaveLength(2);
    for (const spawn of serverSpawns) {
      expect(spawn.args.join("\0")).not.toContain(SENTINEL_TOKEN);
      expect(spawn.options?.stdinInput).toBe(`${SENTINEL_TOKEN}\n`);
    }
    expect(remoteExecCalls.some((command) => command.includes("PIDS"))).toBe(
      true
    );
    expect(
      remoteExecCalls.some((command) => command.includes("kill -TERM"))
    ).toBe(true);
    expect(stopCalls).toBeGreaterThanOrEqual(1);
  });

  test("does not stop unknown remote port owners", async () => {
    scenario = "port-in-use-unknown-owner";

    await startSshRemoteRuntime(CONFIG, {
      dependencies: TEST_DEPENDENCIES,
    }).then(
      () => {
        throw new Error("connect should fail");
      },
      (error) => {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain(
          "could not verify it owns the listening process"
        );
      }
    );

    expect(remoteExecCalls.some((command) => command.includes("PIDS"))).toBe(
      true
    );
    expect(
      remoteExecCalls.some((command) => command.includes("kill -TERM"))
    ).toBe(false);
  });

  test("retries remote port recovery only once", async () => {
    scenario = "port-in-use-retry-fails";

    await startSshRemoteRuntime(CONFIG, {
      dependencies: TEST_DEPENDENCIES,
    }).then(
      () => {
        throw new Error("connect should fail");
      },
      (error) => {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain(
          "Remote runtime port 39123 is already in use"
        );
      }
    );

    expect(
      remoteExecCalls.filter((command) => command.includes("kill -TERM"))
    ).toHaveLength(1);
  });
});

async function _withFetch(run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    Response.json({
      ok: true,
      version: currentDesktopVersion(),
      protocolVersion: 1,
      capabilities: [
        "streamThread",
        "filesystem",
        "models",
        "mcp",
        "builtinTools",
        "skills",
        "search",
        "network",
        "traces",
      ],
      homePath: "/home/test/.llm-space-server",
      workspacePath: "/home/test/.llm-space-server/workspace",
      platform: { os: "linux", arch: "x64" },
    })) as unknown as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}
