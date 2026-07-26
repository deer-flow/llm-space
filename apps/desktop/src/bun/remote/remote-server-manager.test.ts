import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { RuntimeClient } from "@llm-space/runtime/runtime";
import { RuntimeRouter } from "@llm-space/runtime/runtime";

import type { RemoteServerView } from "../../shared/remote-servers";

import { RemoteServerManager } from "./remote-server-manager";
import type { SshRemoteRuntimeConfig } from "./ssh-bootstrap-config";
import type { SshHostKeyService } from "./ssh-host-key";

type StartSshRemoteRuntime = ConstructorParameters<
  typeof RemoteServerManager
>[1];

function _localRuntime(): RuntimeClient {
  return {
    info: () => ({
      id: "local",
      kind: "local",
      name: "Local",
      status: "connected",
      capabilities: [],
    }),
  } as unknown as RuntimeClient;
}

function _remoteRuntime(id: SshRemoteRuntimeConfig["id"]): RuntimeClient {
  return {
    info: () => ({
      id,
      kind: "remote",
      name: id,
      status: "connected",
      capabilities: [],
    }),
  } as unknown as RuntimeClient;
}

function _manager(
  start: StartSshRemoteRuntime,
  home = mkdtempSync(path.join(tmpdir(), "llm-space-remote-manager-test-")),
  onStatusChanged?: ConstructorParameters<typeof RemoteServerManager>[2],
  hostKeyService: SshHostKeyService = _trustedHostKeyService()
): RemoteServerManager {
  process.env.LLM_SPACE_HOME = home;
  return new RemoteServerManager(
    new RuntimeRouter(_localRuntime()),
    start,
    onStatusChanged,
    hostKeyService
  );
}

function _trustedHostKeyService(): SshHostKeyService {
  return {
    check: () => Promise.resolve({ status: "trusted" }),
    trust: () => Promise.resolve(),
  };
}

describe("RemoteServerManager", () => {
  test("connecting a second SSH server disconnects the first after the second connects", async () => {
    const stopped: string[] = [];
    const starts: string[] = [];
    const manager = _manager((config) => {
      starts.push(config.id);
      return Promise.resolve({
        client: _remoteRuntime(config.id),
        stop: () => {
          stopped.push(config.id);
          return Promise.resolve();
        },
      });
    });

    const [host1] = manager.addServer({
      name: "host1",
      host: "host1",
    });
    const host2 = manager.addServer({
      name: "host2",
      host: "host2",
    })[1];

    await manager.connectServer(host1.id);
    expect(stopped).toEqual([]);
    const next = await manager.connectServer(host2.id);

    expect(starts).toEqual([host1.runtimeId, host2.runtimeId]);
    expect(stopped).toEqual([host1.runtimeId]);
    expect(next.find((server) => server.id === host1.id)?.status).toBe(
      "disconnected"
    );
    expect(next.find((server) => server.id === host2.id)?.status).toBe(
      "connected"
    );
    expect(next.find((server) => server.id === host2.id)?.defaultRuntime).toBe(
      true
    );
  });

  test("disconnects an existing server before connecting the same SSH target and port", async () => {
    const events: string[] = [];
    const manager = _manager((config) => {
      events.push(`start:${config.host}:${config.user ?? ""}`);
      return Promise.resolve({
        client: _remoteRuntime(config.id),
        stop: () => {
          events.push(`stop:${config.host}:${config.user ?? ""}`);
          return Promise.resolve();
        },
      });
    });

    const [host1] = manager.addServer({
      name: "host1",
      host: "same-host",
      user: "user",
    });
    const host2 = manager.addServer({
      name: "host2",
      host: "same-host",
      user: "user",
    })[1];

    await manager.connectServer(host1.id);
    const next = await manager.connectServer(host2.id);

    expect(events).toEqual([
      "start:same-host:user",
      "stop:same-host:user",
      "start:same-host:user",
    ]);
    expect(next.find((server) => server.id === host1.id)?.status).toBe(
      "disconnected"
    );
    expect(next.find((server) => server.id === host2.id)?.status).toBe(
      "connected"
    );
  });

  test("keeps the previous SSH server connected when connecting a second server fails", async () => {
    const stopped: string[] = [];
    const manager = _manager((config) => {
      if (config.host === "host2") {
        return Promise.reject(new Error("host2 failed"));
      }
      return Promise.resolve({
        client: _remoteRuntime(config.id),
        stop: () => {
          stopped.push(config.id);
          return Promise.resolve();
        },
      });
    });

    const [host1] = manager.addServer({
      name: "host1",
      host: "host1",
    });
    const host2 = manager.addServer({
      name: "host2",
      host: "host2",
    })[1];

    await manager.connectServer(host1.id);
    try {
      await manager.connectServer(host2.id);
      throw new Error("connect should fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("host2 failed");
    }

    const next = manager.listServers();
    expect(stopped).toEqual([]);
    expect(next.find((server) => server.id === host1.id)?.status).toBe(
      "connected"
    );
    expect(next.find((server) => server.id === host1.id)?.defaultRuntime).toBe(
      true
    );
    expect(next.find((server) => server.id === host2.id)?.status).toBe(
      "error"
    );
    expect(next.find((server) => server.id === host2.id)?.defaultRuntime).toBe(
      false
    );
  });

  test("keeps the previous SSH server connected while a second server waits for host trust", async () => {
    const stopped: string[] = [];
    const manager = _manager(
      (config) =>
        Promise.resolve({
          client: _remoteRuntime(config.id),
          stop: () => {
            stopped.push(config.id);
            return Promise.resolve();
          },
        }),
      undefined,
      undefined,
      {
        check: (config) =>
          Promise.resolve(
            config.host === "host2"
              ? {
                  status: "first-time",
                  request: {
                    requestId: "trust-host2",
                    kind: "first-time",
                    target: "host2",
                    host: "host2",
                    keyType: "ssh-ed25519",
                    fingerprint: "SHA256:host2",
                    publicKeyLine: "host2 ssh-ed25519 AAAA",
                  },
                }
              : { status: "trusted" }
          ),
        trust: () => Promise.resolve(),
      }
    );

    const [host1] = manager.addServer({
      name: "host1",
      host: "host1",
    });
    const host2 = manager.addServer({
      name: "host2",
      host: "host2",
    })[1];

    await manager.connectServer(host1.id);
    const waiting = await manager.connectServer(host2.id);

    expect(stopped).toEqual([]);
    expect(waiting.find((server) => server.id === host1.id)?.status).toBe(
      "connected"
    );
    expect(waiting.find((server) => server.id === host1.id)?.defaultRuntime).toBe(
      true
    );
    expect(waiting.find((server) => server.id === host2.id)?.status).toBe(
      "trust-required"
    );

    const rejected = await manager.rejectServerHostKey(
      host2.id,
      "trust-host2"
    );

    expect(rejected.find((server) => server.id === host1.id)?.status).toBe(
      "connected"
    );
    expect(
      rejected.find((server) => server.id === host1.id)?.defaultRuntime
    ).toBe(true);
    expect(rejected.find((server) => server.id === host2.id)?.status).toBe(
      "disconnected"
    );
  });

  test("does not fail a successful switch when previous server cleanup fails", async () => {
    const manager = _manager((config) =>
      Promise.resolve({
        client: _remoteRuntime(config.id),
        stop: () =>
          config.host === "host1"
            ? Promise.reject(new Error("stop host1 failed"))
            : Promise.resolve(),
      })
    );

    const [host1] = manager.addServer({
      name: "host1",
      host: "host1",
    });
    const host2 = manager.addServer({
      name: "host2",
      host: "host2",
    })[1];

    const next = await manager.connectServer(host1.id).then(() =>
      manager.connectServer(host2.id)
    );

    expect(next.find((server) => server.id === host1.id)?.status).toBe(
      "disconnected"
    );
    expect(next.find((server) => server.id === host2.id)?.status).toBe(
      "connected"
    );
    expect(next.find((server) => server.id === host2.id)?.defaultRuntime).toBe(
      true
    );
  });

  test("loads legacy server config with default install directory", () => {
    const home = mkdtempSync(
      path.join(tmpdir(), "llm-space-remote-manager-test-")
    );
    const settingsDir = path.join(home, "settings");
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(
      path.join(settingsDir, "remote-servers.json"),
      `${JSON.stringify(
        {
          servers: [
            {
              id: "legacy",
              kind: "ssh",
              name: "legacy host",
              host: "host",
              port: 22,
              remoteHome: "~/.llm-space-server",
              remoteServerPort: 39123,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const manager = _manager(
      () => {
        throw new Error("unexpected connect");
      },
      home
    );

    expect(manager.listServers()[0]?.remoteInstallDir).toBe(
      "~/.llm-space/remote-runtime"
    );
    expect(manager.listServers()[0]).not.toHaveProperty("port");
  });

  test("drops advanced ssh overrides from current config version", () => {
    const home = mkdtempSync(
      path.join(tmpdir(), "llm-space-remote-manager-test-")
    );
    const settingsDir = path.join(home, "settings");
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(
      path.join(settingsDir, "remote-servers.json"),
      `${JSON.stringify(
        {
          version: 2,
          servers: [
            {
              id: "explicit-22",
              kind: "ssh",
              name: "explicit 22",
              host: "host",
              user: "user",
              port: 22,
              identityFile: "/tmp/key",
              remoteRepo: "/tmp/repo",
              remoteHome: "~/.llm-space-server",
              remoteServerPort: 39123,
              remoteInstallDir: "~/.llm-space/remote-runtime",
              localPort: 40000,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const manager = _manager(
      () => {
        throw new Error("unexpected connect");
      },
      home
    );

    const [server] = manager.listServers();
    expect(server).toMatchObject({
      name: "explicit 22",
      host: "host",
      user: "user",
      remoteInstallDir: "~/.llm-space/remote-runtime",
      remoteHome: "~/.llm-space-server",
      remoteServerPort: 39123,
    });
    expect(server).not.toHaveProperty("port");
    expect(server).not.toHaveProperty("identityFile");
    expect(server).not.toHaveProperty("remoteRepo");
    expect(server).not.toHaveProperty("localPort");
  });

  test("uses only name host and user for managed ssh config", async () => {
    let sshConfig: SshRemoteRuntimeConfig | undefined;
    const manager = _manager((config) => {
      sshConfig = config;
      return Promise.resolve({
        client: _remoteRuntime(config.id),
        stop: () => Promise.resolve(),
      });
    });

    const [server] = manager.addServer({
      name: "devbox",
      host: "devbox",
      user: "qiangenchao",
    });

    await manager.connectServer(server.id);

    expect(sshConfig).toMatchObject({
      name: "devbox",
      host: "devbox",
      user: "qiangenchao",
      port: undefined,
      identityFile: undefined,
      remoteRepo: "",
      remoteInstallDir: "~/.llm-space/remote-runtime",
      remoteHome: "~/.llm-space-server",
      remoteServerPort: 39123,
      localPort: undefined,
    });
  });

  test("cleans local state when disconnect stop fails", async () => {
    const statuses: string[] = [];
    const manager = _manager(
      (config) =>
        Promise.resolve({
          client: _remoteRuntime(config.id),
          stop: () => Promise.reject(new Error("stop failed")),
        }),
      undefined,
      ({ servers }) => statuses.push(servers[0]?.status ?? "missing")
    );

    const [server] = manager.addServer({ name: "host", host: "host" });
    await manager.connectServer(server.id);
    try {
      await manager.disconnectServer(server.id);
      throw new Error("disconnect should fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("stop failed");
    }

    const [view] = manager.listServers();
    expect(view?.status).toBe("disconnected");
    expect(view?.defaultRuntime).toBe(false);
    expect(statuses.at(-1)).toBe("disconnected");
  });

  test("publishes connection progress stages", async () => {
    const stages: string[] = [];
    let lastSteps: string[] = [];
    const manager = _manager(
      (_config, options) => {
        options?.onProgress?.({
          stage: "server-install",
          message: "Downloading remote runtime package",
        });
        options?.onProgress?.({
          stage: "server-start",
          message: "Starting remote runtime",
        });
        options?.onProgress?.({
          stage: "tunnel-start",
          message: "Opening SSH tunnel",
        });
        options?.onProgress?.({
          stage: "health-check",
          message: "Verifying remote runtime",
        });
        return Promise.resolve({
          client: _remoteRuntime(_config.id),
          stop: () => Promise.resolve(),
        });
      },
      undefined,
      ({ servers }) => {
        const stage = servers[0]?.stage;
        if (stage) stages.push(stage);
        lastSteps =
          servers[0]?.steps?.map((step) => `${step.stage}:${step.status}`) ?? [];
      }
    );

    const [server] = manager.addServer({ name: "host", host: "host" });
    const next = await manager.connectServer(server.id);

    expect(stages).toContain("ssh-check");
    expect(stages).toContain("server-install");
    expect(stages).toContain("server-start");
    expect(stages).toContain("tunnel-start");
    expect(stages).toContain("health-check");
    expect(stages).toContain("connected");
    expect(next[0]?.stageLabel).toBe("Connected");
    expect(lastSteps).toContain("server-install:success");
    expect(lastSteps).toContain("connected:success");
  });

  test("marks the failing connection step", async () => {
    let last: RemoteServerView | undefined;
    const manager = _manager(
      (_config, options) => {
        options?.onProgress?.({
          stage: "server-install",
          message: "Installing package",
        });
        return Promise.reject(new Error("install failed"));
      },
      undefined,
      ({ servers }) => {
        last = servers[0];
      }
    );

    const [server] = manager.addServer({ name: "host", host: "host" });
    try {
      await manager.connectServer(server.id);
      throw new Error("connect should fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("install failed");
    }

    expect(
      last?.steps?.find((step) => step.stage === "server-install")?.status
    ).toBe("error");
    expect(
      last?.steps?.find((step) => step.stage === "server-install")?.message
    ).toBe("install failed");
    expect(last?.status).toBe("error");
  });

  test("pauses first-time hosts until the user trusts the key", async () => {
    let startCount = 0;
    let trusted = false;
    const manager = _manager(
      (config) => {
        startCount += 1;
        return Promise.resolve({
          client: _remoteRuntime(config.id),
          stop: () => Promise.resolve(),
        });
      },
      undefined,
      undefined,
      {
        check: () =>
          Promise.resolve(
            trusted
              ? { status: "trusted" }
              : {
                  status: "first-time",
                  request: {
                    requestId: "trust-1",
                    kind: "first-time",
                    target: "user@host",
                    host: "host",
                    user: "user",
                    keyType: "ssh-ed25519",
                    fingerprint: "SHA256:test",
                    publicKeyLine: "host ssh-ed25519 AAAA",
                  },
                }
          ),
        trust: () => {
          trusted = true;
          return Promise.resolve();
        },
      }
    );

    const [server] = manager.addServer({
      name: "host",
      host: "host",
      user: "user",
    });
    const waiting = await manager.connectServer(server.id);

    expect(startCount).toBe(0);
    expect(waiting[0]?.status).toBe("trust-required");
    expect(waiting[0]?.trustRequest).toMatchObject({
      kind: "first-time",
      fingerprint: "SHA256:test",
    });

    const connected = await manager.trustServerHostKey(server.id, "trust-1");

    expect(startCount).toBe(1);
    expect(connected[0]?.status).toBe("connected");
  });

  test("rejecting a changed host key does not start ssh runtime", async () => {
    let startCount = 0;
    let trustCount = 0;
    const manager = _manager(
      (config) => {
        startCount += 1;
        return Promise.resolve({
          client: _remoteRuntime(config.id),
          stop: () => Promise.resolve(),
        });
      },
      undefined,
      undefined,
      {
        check: () =>
          Promise.resolve({
            status: "changed",
            request: {
              requestId: "changed-1",
              kind: "changed",
              target: "host",
              host: "host",
              keyType: "ecdsa-sha2-nistp256",
              fingerprint: "SHA256:changed",
              knownHostsFile: "/Users/bytedance/.ssh/known_hosts",
              knownHostsLine: 6,
              publicKeyLine: "host ecdsa-sha2-nistp256 AAAA",
            },
          }),
        trust: () => {
          trustCount += 1;
          return Promise.resolve();
        },
      }
    );

    const [server] = manager.addServer({ name: "host", host: "host" });
    const waiting = await manager.connectServer(server.id);
    const rejected = await manager.rejectServerHostKey(server.id, "changed-1");

    expect(waiting[0]?.status).toBe("trust-required");
    expect(waiting[0]?.trustRequest?.kind).toBe("changed");
    expect(rejected[0]?.status).toBe("disconnected");
    expect(startCount).toBe(0);
    expect(trustCount).toBe(0);
  });

  test("does not allow editing while waiting for host key trust", async () => {
    const manager = _manager(
      (config) =>
        Promise.resolve({
          client: _remoteRuntime(config.id),
          stop: () => Promise.resolve(),
        }),
      undefined,
      undefined,
      {
        check: () =>
          Promise.resolve({
            status: "first-time",
            request: {
              requestId: "trust-1",
              kind: "first-time",
              target: "host",
              host: "host",
              keyType: "ssh-ed25519",
              fingerprint: "SHA256:test",
              publicKeyLine: "host ssh-ed25519 AAAA",
            },
          }),
        trust: () => Promise.resolve(),
      }
    );

    const [server] = manager.addServer({ name: "host", host: "host" });
    await manager.connectServer(server.id);

    expect(() =>
      manager.updateServer(server.id, { name: "changed", host: "other" })
    ).toThrow("Disconnect remote server before update");
  });
});
