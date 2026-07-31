import { beforeEach, describe, expect, test } from "bun:test";

import type { ManagedProcess } from "./process-utils";
import { currentDesktopVersion } from "./server-package";
import type { SshRemoteRuntimeConfig } from "./ssh-bootstrap-config";
import { startSshRemoteRuntime } from "./ssh-remote-runtime";

let scenario:
  | "missing-runtime-binary"
  | "non-runtime-failure"
  | "port-in-use";
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
      scenario === "port-in-use" &&
      serverSpawnCalls === 1;
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

  test("keeps same-target clients isolated across stop and reconnect", async () => {
    const remote = new StatefulSshFake();

    await remote.withFetch(async () => {
      const first = await remote.start();
      const firstEndpoint = remote.latestEndpoint();
      const second = await remote.start();
      const secondEndpoint = remote.latestEndpoint();

      expect(firstEndpoint.localPort).toBe(41000);
      expect(secondEndpoint.localPort).toBe(41001);
      expect(secondEndpoint.remotePort).not.toBe(firstEndpoint.remotePort);
      expect(secondEndpoint.token).not.toBe(firstEndpoint.token);
      expect(remote.endpointState(firstEndpoint)).toBe("healthy");
      expect(remote.endpointState(secondEndpoint)).toBe("healthy");

      await second.stop();

      expect(remote.endpointState(secondEndpoint)).toBe("stopped");
      expect(remote.endpointState(firstEndpoint)).toBe("healthy");
      expect(remote.resourcesFor(firstEndpoint).map((p) => p.active)).toEqual([
        true,
        true,
      ]);
      expect(remote.resourcesFor(secondEndpoint).map((p) => p.active)).toEqual([
        false,
        false,
      ]);
      await _expectRejects(second.client.connect(), "endpoint stopped");
      await first.client.connect();

      const reconnectedSecond = await remote.start();
      const reconnectedEndpoint = remote.latestEndpoint();

      expect(reconnectedEndpoint.localPort).toBe(41002);
      expect(reconnectedEndpoint.remotePort).not.toBe(
        firstEndpoint.remotePort
      );
      expect(reconnectedEndpoint.token).not.toBe(firstEndpoint.token);
      expect(remote.endpointState(secondEndpoint)).toBe("stopped");
      expect(remote.endpointState(reconnectedEndpoint)).toBe("healthy");
      await reconnectedSecond.client.connect();
      await first.client.connect();

      await reconnectedSecond.stop();
      expect(remote.endpointState(reconnectedEndpoint)).toBe("stopped");
      expect(remote.endpointState(firstEndpoint)).toBe("healthy");
      await first.client.connect();
      await first.stop();
    });

    expect(remote.remoteExecCommands).toEqual([]);
    expect(remote.processes.every((process) => !process.active)).toBe(true);
  });

  test("awaits failed collision cleanup before spawning the retry", async () => {
    const remote = new StatefulSshFake();
    remote.occupiedRemotePorts.add(CONFIG.remoteServerPort);

    await remote.withFetch(async () => {
      const handle = await remote.start();
      const [failedServer, retryServer] = remote.serverProcesses();
      if (!failedServer || !retryServer) {
        throw new Error("Expected one failed server and one retry server.");
      }

      expect(failedServer.exitCode).toBe(127);
      expect(failedServer.stopCompleted).toBe(true);
      expect(failedServer.active).toBe(false);
      expect(
        remote.events.indexOf(`stop:done:${failedServer.id}`)
      ).toBeLessThan(remote.events.indexOf(`spawn:${retryServer.id}`));
      expect(retryServer.active).toBe(true);

      await handle.stop();
    });
  });

  test("leaves no server or tunnel resources after a failed tunnel attempt", async () => {
    const remote = new StatefulSshFake();
    remote.failNextTunnel = true;

    await _expectRejects(remote.start(), "ssh tunnel exited early");

    expect(remote.processes.map((process) => process.label)).toEqual([
      "remote server",
      "ssh tunnel",
    ]);
    expect(remote.processes.every((process) => process.stopCompleted)).toBe(
      true
    );
    expect(remote.processes.every((process) => !process.active)).toBe(true);
  });

  test("awaits failed server and tunnel cleanup before a collision retry", async () => {
    const remote = new StatefulSshFake();
    remote.failNextTunnelWithPortCollision = true;

    await remote.withFetch(async () => {
      const handle = await remote.start();
      const [failedServer, retryServer] = remote.serverProcesses();
      const [failedTunnel] = remote.tunnelProcesses();
      if (!failedServer || !failedTunnel || !retryServer) {
        throw new Error("Expected a failed attempt followed by a retry.");
      }

      expect(failedServer.stopCompleted).toBe(true);
      expect(failedTunnel.stopCompleted).toBe(true);
      expect(failedServer.active).toBe(false);
      expect(failedTunnel.active).toBe(false);
      expect(
        remote.events.indexOf(`stop:done:${failedServer.id}`)
      ).toBeLessThan(remote.events.indexOf(`spawn:${retryServer.id}`));
      expect(
        remote.events.indexOf(`stop:done:${failedTunnel.id}`)
      ).toBeLessThan(remote.events.indexOf(`spawn:${retryServer.id}`));

      await handle.stop();
    });
  });

  test("leaves no resources after exhausting collision retries", async () => {
    const remote = new StatefulSshFake();
    remote.collideEveryServer = true;

    await _expectRejects(
      remote.start(),
      "no existing listener was stopped"
    );

    expect(remote.serverProcesses()).toHaveLength(5);
    expect(remote.processes.every((process) => process.stopCompleted)).toBe(
      true
    );
    expect(remote.processes.every((process) => !process.active)).toBe(true);
  });

  test("uses the same retry port for source-mode server and tunnel", async () => {
    const remote = new StatefulSshFake();
    remote.occupiedRemotePorts.add(CONFIG.remoteServerPort);
    const originalMode = process.env.LLM_SPACE_REMOTE_SERVER_MODE;

    await _withRemoteServerMode("source", async () => {
      await remote.withFetch(async () => {
        const handle = await remote.start({
          ...CONFIG,
          remoteRepo: "~/src/llm-space",
        });
        const endpoint = remote.latestEndpoint();
        const sourceRetry = remote
          .serverProcesses()
          .find((process) => process.exitCode === null);

        expect(sourceRetry?.command).toContain(
          "exec bun --filter @llm-space/server dev --"
        );
        expect(sourceRetry?.remotePort).toBe(endpoint.remotePort);
        expect(endpoint.remotePort).not.toBe(CONFIG.remoteServerPort);
        await handle.stop();
      });
    });

    expect(process.env.LLM_SPACE_REMOTE_SERVER_MODE).toBe(originalMode);
  });

  test("fails closed when a collision reports a different port", async () => {
    const remote = new StatefulSshFake();
    remote.reportedCollisionPort = 39124;

    await remote.withFetch(async () => {
      await _expectRejects(
        remote.start(),
        "reported port 39124 in use, but this connection attempted port 39123"
      );
    });

    expect(remote.serverProcesses()).toHaveLength(1);
    expect(remote.processes[0]?.stopCompleted).toBe(true);
    expect(remote.processes[0]?.active).toBe(false);
    expect(
      remote.processes.some((process) => process.label === "ssh tunnel")
    ).toBe(false);
    expect(remote.remoteExecCommands).toEqual([]);
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

interface StatefulEndpoint {
  localPort: number;
  remotePort: number;
  token: string;
  serverProcessId: number;
  tunnelProcessId: number;
}

interface StatefulFakeProcess {
  id: number;
  label: string;
  command: string;
  localPort?: number;
  remotePort?: number;
  token?: string;
  exitCode: number | null;
  active: boolean;
  serverAlive: boolean;
  stopCompleted: boolean;
}

class StatefulSshFake {
  readonly events: string[] = [];
  readonly processes: StatefulFakeProcess[] = [];
  readonly endpoints: StatefulEndpoint[] = [];
  readonly occupiedRemotePorts = new Set<number>();
  readonly remoteExecCommands: string[] = [];
  collideEveryServer = false;
  failNextTunnel = false;
  failNextTunnelWithPortCollision = false;
  reportedCollisionPort: number | null = null;

  private _nextLocalPort = 41000;
  private _nextProcessId = 1;

  readonly dependencies = {
    findFreePort: () => Promise.resolve(this._nextLocalPort++),
    installRemoteServerPackage: () =>
      Promise.resolve({
        entrypoint: "/opt/runtime/versions/test/bin/llm-space-server",
        version: "test",
        platform: { os: "linux" as const, arch: "x64" as const },
      }),
    getOrDownloadServerPackage: () =>
      Promise.resolve({ path: "/tmp/llm-space-server-test.tar.gz" }),
    uploadRemoteFile: () => Promise.resolve(),
    execRemoteCommand: (_config: SshRemoteRuntimeConfig, command: string) => {
      this.remoteExecCommands.push(command);
      return Promise.resolve({ stdout: "", stderr: "" });
    },
    spawnManagedProcess: (
      label: string,
      _executable: string,
      args: string[]
    ) => this._spawn(label, args),
  };

  start(config: SshRemoteRuntimeConfig = CONFIG) {
    return startSshRemoteRuntime(config, { dependencies: this.dependencies });
  }

  async withFetch(run: () => Promise<void>): Promise<void> {
    const original = globalThis.fetch;
    globalThis.fetch = this._fetch as typeof fetch;
    try {
      await run();
    } finally {
      globalThis.fetch = original;
    }
  }

  latestEndpoint(): StatefulEndpoint {
    const endpoint = this.endpoints.at(-1);
    if (!endpoint) throw new Error("No stateful SSH endpoint was created.");
    return endpoint;
  }

  endpointState(endpoint: StatefulEndpoint): "healthy" | "stopped" {
    const [server, tunnel] = this.resourcesFor(endpoint);
    return server?.active &&
      server.serverAlive &&
      tunnel?.active &&
      tunnel.exitCode === null
      ? "healthy"
      : "stopped";
  }

  resourcesFor(endpoint: StatefulEndpoint): StatefulFakeProcess[] {
    return [endpoint.serverProcessId, endpoint.tunnelProcessId]
      .map((id) => this.processes.find((process) => process.id === id))
      .filter((process): process is StatefulFakeProcess => Boolean(process));
  }

  serverProcesses(): StatefulFakeProcess[] {
    return this.processes.filter((process) => process.label === "remote server");
  }

  tunnelProcesses(): StatefulFakeProcess[] {
    return this.processes.filter((process) => process.label === "ssh tunnel");
  }

  private _spawn(label: string, args: string[]): ManagedProcess {
    if (label === "remote server") {
      return this._spawnServer(args);
    }
    if (label === "ssh tunnel") {
      return this._spawnTunnel(args);
    }
    throw new Error(`Unexpected managed process: ${label}`);
  }

  private _spawnServer(args: string[]): ManagedProcess {
    const command = args.at(-1) ?? "";
    const remotePort = _serverPort(args);
    const token = _commandValue(command, "token");
    const activeServer = this.processes.some(
      (process) =>
        process.label === "remote server" &&
        process.remotePort === remotePort &&
        process.active &&
        process.serverAlive
    );
    const collision =
      this.collideEveryServer ||
      this.reportedCollisionPort !== null ||
      this.occupiedRemotePorts.has(remotePort) ||
      activeServer;
    const reportedPort = this.reportedCollisionPort ?? remotePort;
    this.reportedCollisionPort = null;
    return this._recordProcess({
      label: "remote server",
      command,
      remotePort,
      token,
      exitCode: collision ? 127 : null,
      output: collision
        ? `Failed to start server. Is port ${reportedPort} in use?`
        : "",
    });
  }

  private _spawnTunnel(args: string[]): ManagedProcess {
    const forward = args[args.indexOf("-L") + 1] ?? "";
    const match = /^127\.0\.0\.1:(\d+):127\.0\.0\.1:(\d+)$/.exec(forward);
    if (!match) throw new Error(`Missing tunnel endpoints in ${args.join(" ")}`);
    const localPort = Number(match[1]);
    const remotePort = Number(match[2]);
    const server = this.processes.find(
      (process) =>
        process.label === "remote server" &&
        process.remotePort === remotePort &&
        process.active &&
        process.serverAlive
    );
    if (!server) {
      throw new Error(`No live remote server for tunnel port ${remotePort}.`);
    }
    const portCollision = this.failNextTunnelWithPortCollision;
    const fail = this.failNextTunnel || portCollision;
    this.failNextTunnel = false;
    this.failNextTunnelWithPortCollision = false;
    const managed = this._recordProcess({
      label: "ssh tunnel",
      command: forward,
      localPort,
      remotePort,
      token: server.token,
      exitCode: fail ? 255 : null,
      output: portCollision
        ? `Failed to start server. Is port ${remotePort} in use?`
        : fail
          ? "synthetic tunnel failure"
          : "",
    });
    const tunnel = this.processes.at(-1);
    if (!fail && tunnel) {
      this.endpoints.push({
        localPort,
        remotePort,
        token: server.token ?? "",
        serverProcessId: server.id,
        tunnelProcessId: tunnel.id,
      });
    }
    return managed;
  }

  private _recordProcess(input: {
    label: string;
    command: string;
    localPort?: number;
    remotePort?: number;
    token?: string;
    exitCode: number | null;
    output: string;
  }): ManagedProcess {
    const id = this._nextProcessId++;
    const child = {
      exitCode: input.exitCode,
      signalCode: null,
    };
    const process: StatefulFakeProcess = {
      id,
      label: input.label,
      command: input.command,
      localPort: input.localPort,
      remotePort: input.remotePort,
      token: input.token,
      exitCode: input.exitCode,
      active: true,
      serverAlive: input.label === "remote server" && input.exitCode === null,
      stopCompleted: false,
    };
    const managed = {
      label: input.label,
      child,
      output: () => input.output,
      stop: async () => {
        if (process.stopCompleted) return;
        this.events.push(`stop:start:${id}`);
        // Keep cleanup observably asynchronous across an event-loop turn. A
        // microtask-only stop can finish before a detached cleanup continuation
        // advances, making tests pass even when production forgets to await it.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        process.active = false;
        process.serverAlive = false;
        process.stopCompleted = true;
        if (child.exitCode === null) child.exitCode = 0;
        this.events.push(`stop:done:${id}`);
      },
    } as unknown as ManagedProcess;
    this.processes.push(process);
    this.events.push(`spawn:${id}`);
    return managed;
  }

  private _fetch = (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const endpoint = this.endpoints.find(
      (candidate) => candidate.localPort === Number(url.port)
    );
    if (!endpoint || this.endpointState(endpoint) === "stopped") {
      return Promise.resolve(
        new Response("endpoint stopped", {
          status: 503,
          statusText: "Service Unavailable",
        })
      );
    }
    if (request.headers.get("Authorization") !== `Bearer ${endpoint.token}`) {
      return Promise.resolve(
        new Response("invalid token", {
          status: 401,
          statusText: "Unauthorized",
        })
      );
    }
    if (url.pathname === "/shutdown") {
      const server = this.resourcesFor(endpoint)[0];
      if (server) server.serverAlive = false;
      return Promise.resolve(Response.json({ ok: true }));
    }
    if (url.pathname === "/health") {
      return Promise.resolve(Response.json(_healthResponse()));
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  };
}

function _commandValue(command: string, flag: string): string {
  const match = new RegExp(`--${flag}\\s+'([^']+)'`).exec(command);
  if (!match) throw new Error(`Missing --${flag} in ${command}`);
  return match[1];
}

function _healthResponse() {
  return {
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
  };
}

async function _expectRejects(
  promise: Promise<unknown>,
  expectedMessage: string
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected promise to reject.");
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(expectedMessage);
  }
}

async function _withRemoteServerMode(
  mode: string,
  run: () => Promise<void>
): Promise<void> {
  const hadOriginal = Object.hasOwn(
    process.env,
    "LLM_SPACE_REMOTE_SERVER_MODE"
  );
  const original = process.env.LLM_SPACE_REMOTE_SERVER_MODE;
  process.env.LLM_SPACE_REMOTE_SERVER_MODE = mode;
  try {
    await run();
  } finally {
    if (hadOriginal && original !== undefined) {
      process.env.LLM_SPACE_REMOTE_SERVER_MODE = original;
    } else {
      delete process.env.LLM_SPACE_REMOTE_SERVER_MODE;
    }
  }
}

async function _withFetch(run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    Response.json(_healthResponse())) as unknown as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}
