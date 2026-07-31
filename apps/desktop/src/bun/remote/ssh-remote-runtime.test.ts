import { beforeEach, describe, expect, test } from "bun:test";

import type { ManagedProcess } from "./process-utils";
import { currentDesktopVersion } from "./server-package";
import type { SshRemoteRuntimeConfig } from "./ssh-bootstrap-config";
import { startSshRemoteRuntime } from "./ssh-remote-runtime";

let scenario:
  | "missing-runtime-binary"
  | "non-runtime-failure"
  | "port-in-use"
  | "port-in-use-retry-fails"
  | "second-client-collision"
  | "success";
let installCalls = 0;
let serverSpawnCalls = 0;
let stopCalls = 0;
let diagnosticCalls = 0;
let remoteExecCalls: string[] = [];
let serverPorts: number[] = [];
let tunnelPorts: number[] = [];

const CONFIG: SshRemoteRuntimeConfig = {
  id: "remote:test",
  name: "test",
  host: "host",
  extraArgs: [],
  remoteRepo: "",
  remoteInstallDir: "~/.llm-space/remote-runtime",
  remoteHome: "~/.llm-space-server",
  remoteServerPort: 39123,
  makeDefault: false,
};

const TEST_DEPENDENCIES = {
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
    diagnosticCalls += 1;
    return Promise.resolve({
      stdout:
        "USER=test\nHOME=/home/test\nPWD=/home/test\nentrypoint_exists:1\nentrypoint_executable:1\n",
      stderr: "",
    });
  },
  spawnManagedProcess: (label: string, _command: string, args: string[]) => {
    const attempt = installCalls;
    if (label === "remote server") {
      serverSpawnCalls += 1;
      serverPorts.push(_serverPort(args));
    }
    if (label === "ssh tunnel") {
      tunnelPorts.push(_tunnelPort(args));
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
        scenario === "port-in-use-retry-fails") &&
      (serverSpawnCalls === 1 || scenario === "port-in-use-retry-fails");
    const secondClientCollision =
      label === "remote server" &&
      scenario === "second-client-collision" &&
      serverSpawnCalls === 2;
    return {
      label,
      child: {
        exitCode:
          missing || nonRuntimeFailure || portInUse || secondClientCollision
            ? 127
            : null,
        signalCode: null,
      },
      output: () =>
        missing
          ? "bash: line 1: /opt/runtime/versions/test/bin/llm-space-server: No such file or directory"
          : nonRuntimeFailure
            ? "bash: bun: command not found"
            : portInUse || secondClientCollision
              ? `Failed to start server. Is port ${serverPorts.at(-1)} in use?`
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
  serverPorts = [];
  tunnelPorts = [];
});

describe("startSshRemoteRuntime", () => {
  test("does not reinstall when the runtime binary is missing", async () => {
    await startSshRemoteRuntime(CONFIG, { dependencies: TEST_DEPENDENCIES }).then(
      () => {
        throw new Error("connect should fail");
      },
      (error) => {
        expect(error).toBeInstanceOf(Error);
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

    await startSshRemoteRuntime(CONFIG, { dependencies: TEST_DEPENDENCIES }).then(
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

  test("uses a different per-connection port without signaling the existing listener", async () => {
    scenario = "port-in-use";

    await _withFetch(async () => {
      const handle = await startSshRemoteRuntime(CONFIG, {
        dependencies: TEST_DEPENDENCIES,
      });
      await handle.stop();
    });

    expect(installCalls).toBe(1);
    expect(serverSpawnCalls).toBe(2);
    expect(serverPorts[0]).toBe(39123);
    expect(serverPorts[1]).not.toBe(serverPorts[0]);
    expect(tunnelPorts).toEqual([serverPorts[1]]);
    expect(remoteExecCalls).toEqual([]);
    expect(stopCalls).toBeGreaterThanOrEqual(1);
  });

  test("keeps two clients on the same default SSH target healthy", async () => {
    scenario = "second-client-collision";

    await _withFetch(async () => {
      const first = await startSshRemoteRuntime(CONFIG, {
        dependencies: TEST_DEPENDENCIES,
      });
      const second = await startSshRemoteRuntime(CONFIG, {
        dependencies: TEST_DEPENDENCIES,
      });

      expect(tunnelPorts).toHaveLength(2);
      expect(tunnelPorts[1]).not.toBe(tunnelPorts[0]);
      expect(remoteExecCalls).toEqual([]);

      await first.client.connect();
      await second.stop();
      await first.client.connect();
      await first.stop();
    });
  });

  test("fails non-destructively after bounded per-connection port collisions", async () => {
    scenario = "port-in-use-retry-fails";

    await startSshRemoteRuntime(CONFIG, { dependencies: TEST_DEPENDENCIES }).then(
      () => {
        throw new Error("connect should fail");
      },
      (error) => {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain(
          "no existing listener was stopped"
        );
      }
    );

    expect(serverPorts.length).toBeGreaterThan(1);
    expect(new Set(serverPorts).size).toBe(serverPorts.length);
    expect(remoteExecCalls).toEqual([]);
  });
});

function _serverPort(args: string[]): number {
  const match = /--port\s+(\d+)/.exec(args.at(-1) ?? "");
  if (!match) throw new Error(`Missing remote server port in ${args.join(" ")}`);
  return Number(match[1]);
}

function _tunnelPort(args: string[]): number {
  const forward = args[args.indexOf("-L") + 1] ?? "";
  const match = /:127\.0\.0\.1:(\d+)$/.exec(forward);
  if (!match) throw new Error(`Missing tunnel port in ${args.join(" ")}`);
  return Number(match[1]);
}

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
