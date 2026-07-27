import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { uuid } from "@llm-space/core";
import { getSettingsDir } from "@llm-space/core/server";
import type {
  RuntimeClient,
  RuntimeId,
  RuntimeRouter,
} from "@llm-space/runtime/runtime";

import type {
  RemoteConnectionStage,
  RemoteConnectionStepView,
  RemoteHostKeyTrustRequest,
  RemoteServerConfig,
  RemoteServerDraft,
  RemoteServerStatusChangedPayload,
  RemoteServerView,
} from "../../shared/remote-servers";

import { DEFAULT_REMOTE_INSTALL_DIR } from "./server-package";
import type { SshRemoteRuntimeConfig } from "./ssh-bootstrap-config";
import {
  OpenSshHostKeyService,
  type SshHostKeyService,
} from "./ssh-host-key";
import { startSshRemoteRuntime } from "./ssh-remote-runtime";

interface RemoteRuntimeHandle {
  client: RuntimeClient;
  stop(): Promise<void> | void;
}

type StartSshRemoteRuntime = (
  config: SshRemoteRuntimeConfig,
  options?: {
    onProgress?: (progress: { stage: string; message: string }) => void;
  }
) => Promise<RemoteRuntimeHandle>;

interface RemoteServersConfigFile {
  version?: number;
  servers: PersistedRemoteServerConfig[];
}

type PersistedRemoteServerConfig = RemoteServerConfig & {
  port?: number;
  identityFile?: string;
  remoteRepo?: string;
  localPort?: number;
};

const REMOTE_SERVERS_CONFIG_VERSION = 2;

interface ConnectedServer {
  status: "connected" | "connecting" | "error" | "trust-required";
  stage: RemoteConnectionStage;
  stageLabel: string;
  updatedAt: number;
  steps: RemoteConnectionStepView[];
  handle?: RemoteRuntimeHandle;
  trustRequest?: RemoteHostKeyTrustRequest;
  error?: string;
}

type RemoteServerStatusListener = (
  payload: RemoteServerStatusChangedPayload
) => void;

export class RemoteServerManager {
  private _servers: RemoteServerConfig[];
  private readonly _connections = new Map<string, ConnectedServer>();
  private _operationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly _runtimeRouter: RuntimeRouter,
    private readonly _startSshRemoteRuntime: StartSshRemoteRuntime =
      startSshRemoteRuntime,
    private _onStatusChanged?: RemoteServerStatusListener,
    private readonly _hostKeyService: SshHostKeyService =
      new OpenSshHostKeyService()
  ) {
    this._servers = this._load();
  }

  setStatusListener(listener: RemoteServerStatusListener): void {
    this._onStatusChanged = listener;
  }

  listServers(): RemoteServerView[] {
    return this._servers.map((server) => this._view(server));
  }

  addServer(draft: RemoteServerDraft): RemoteServerView[] {
    const now = Date.now();
    const server = this._normalizeDraft(draft, {
      id: uuid(),
      createdAt: now,
      updatedAt: now,
    });
    this._servers.push(server);
    this._save();
    return this.listServers();
  }

  updateServer(id: string, draft: RemoteServerDraft): RemoteServerView[] {
    this._assertNotConnected(id, "update");
    const index = this._servers.findIndex((server) => server.id === id);
    if (index === -1) {
      throw new Error(`Remote server not found: ${id}`);
    }
    const current = this._servers[index];
    this._servers[index] = this._normalizeDraft(draft, {
      id,
      createdAt: current.createdAt,
      updatedAt: Date.now(),
    });
    this._save();
    return this.listServers();
  }

  async removeServer(id: string): Promise<RemoteServerView[]> {
    return this._enqueue(() => {
      const next = this._servers.filter((server) => server.id !== id);
      if (next.length === this._servers.length) {
        throw new Error(`Remote server not found: ${id}`);
      }
      this._assertNotConnected(id, "remove");
      this._connections.delete(id);
      this._servers = next;
      this._save();
      this._emitStatusChanged();
      return this.listServers();
    });
  }

  async connectServer(id: string): Promise<RemoteServerView[]> {
    return this._enqueue(() => this._connectServer(id));
  }

  private async _connectServer(id: string): Promise<RemoteServerView[]> {
    const server = this._find(id);
    const existing = this._connections.get(id);
    if (existing?.status === "connected") {
      this._runtimeRouter.setDefaultRuntime(this._runtimeId(id));
      return this.listServers();
    }

    await this._disconnectConflictingConnectedServersBeforeConnect(server);

    this._setConnection(id, {
      status: "connecting",
      stage: "ssh-check",
      stageLabel: "Checking SSH access",
    });
    try {
      const sshConfig = this._sshConfig(server);
      const hostKey = await this._hostKeyService.check(sshConfig);
      if (hostKey.status === "first-time" || hostKey.status === "changed") {
        this._setConnection(id, {
          status: "trust-required",
          stage: "host-key-check",
          stageLabel: "Confirm SSH host identity",
          trustRequest: hostKey.request,
        });
        return this.listServers();
      }
      if (hostKey.status === "error") {
        throw new Error(hostKey.message);
      }
      const handle = await this._startSshRemoteRuntime(this._sshConfig(server), {
        onProgress: ({ stage, message }) =>
          this._setConnection(id, {
            status: "connecting",
            stage: _connectionStage(stage),
            stageLabel: message,
          }),
      });
      const runtimeId = this._runtimeId(server.id);
      this._runtimeRouter.register(runtimeId, handle.client);
      this._runtimeRouter.setDefaultRuntime(runtimeId);
      this._setConnection(id, {
        status: "connected",
        stage: "connected",
        stageLabel: "Connected",
        handle,
      });
      await this._disconnectOtherServersAfterConnect(id);
      return this.listServers();
    } catch (error) {
      const failedStage = this._connections.get(id)?.stage ?? "error";
      this._setConnection(id, {
        status: "error",
        stage: failedStage,
        stageLabel: "Connection failed",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async disconnectServer(id: string): Promise<RemoteServerView[]> {
    return this._enqueue(() => this._disconnectServer(id));
  }

  async trustServerHostKey(
    id: string,
    requestId: string
  ): Promise<RemoteServerView[]> {
    return this._enqueue(async () => {
      const server = this._find(id);
      const connection = this._connections.get(id);
      const request = connection?.trustRequest;
      if (connection?.status !== "trust-required" || !request) {
        throw new Error(`Remote server is not waiting for host trust: ${id}`);
      }
      if (request.requestId !== requestId) {
        throw new Error("SSH host key trust request is stale.");
      }
      await this._hostKeyService.trust(this._sshConfig(server), request);
      this._connections.delete(id);
      return this._connectServer(id);
    });
  }

  async rejectServerHostKey(
    id: string,
    requestId: string
  ): Promise<RemoteServerView[]> {
    return this._enqueue(() => {
      const connection = this._connections.get(id);
      const request = connection?.trustRequest;
      if (connection?.status !== "trust-required" || !request) {
        return this.listServers();
      }
      if (request.requestId !== requestId) {
        throw new Error("SSH host key trust request is stale.");
      }
      this._connections.delete(id);
      this._emitStatusChanged();
      return this.listServers();
    });
  }

  private async _disconnectServer(id: string): Promise<RemoteServerView[]> {
    let stopError: unknown;
    const connection = this._connections.get(id);
    try {
      if (connection?.handle) {
        await connection.handle.stop();
      }
    } catch (error) {
      stopError = error;
    } finally {
      const runtimeId = this._runtimeId(id);
      if (this._runtimeRouter.getDefaultRuntimeId() === runtimeId) {
        this._runtimeRouter.setDefaultRuntime("local");
      }
      try {
        this._runtimeRouter.unregister(runtimeId);
      } catch {
        // Runtime may not have been registered or may already be removed.
      }
      this._connections.delete(id);
      this._emitStatusChanged();
    }
    if (stopError) {
      throw stopError instanceof Error
        ? stopError
        : new Error("Remote server stop failed.");
    }
    return this.listServers();
  }

  private async _disconnectOtherServersAfterConnect(
    keepId: string
  ): Promise<void> {
    await Promise.all(
      [...this._connections.keys()]
        .filter((id) => id !== keepId)
        .map(async (id) => {
          try {
            await this._disconnectServer(id);
          } catch {
            // The new remote is already connected and selected as default.
            // Treat stale remote cleanup as best-effort so a stop failure does
            // not turn a successful connection switch into a failed connect.
          }
        })
    );
  }

  private async _disconnectConflictingConnectedServersBeforeConnect(
    target: RemoteServerConfig
  ): Promise<void> {
    await Promise.all(
      [...this._connections.entries()]
        .filter(([id, connection]) => {
          if (id === target.id || connection.status !== "connected") {
            return false;
          }
          const current = this._servers.find((server) => server.id === id);
          return current ? _sameRemoteEndpoint(current, target) : false;
        })
        .map(([id]) => this._disconnectServer(id))
    );
  }

  setDefaultRuntime(runtimeId: RuntimeId): RemoteServerView[] {
    this._runtimeRouter.setDefaultRuntime(runtimeId);
    return this.listServers();
  }

  getDefaultRuntime(): RuntimeId {
    return this._runtimeRouter.getDefaultRuntimeId();
  }

  async shutdown(): Promise<void> {
    await this._enqueue(() =>
      Promise.all(
        [...this._connections.keys()].map((id) => this._disconnectServer(id))
      ).then(() => undefined)
    );
  }

  private _enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    const run = this._operationQueue.then(operation, operation);
    this._operationQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private _view(server: RemoteServerConfig): RemoteServerView {
    const connection = this._connections.get(server.id);
    const runtimeId = this._runtimeId(server.id);
    return {
      ...server,
      runtimeId,
      status: connection?.status ?? "disconnected",
      defaultRuntime: this._runtimeRouter.getDefaultRuntimeId() === runtimeId,
      ...(connection?.stage ? { stage: connection.stage } : {}),
      ...(connection?.stageLabel ? { stageLabel: connection.stageLabel } : {}),
      ...(connection?.updatedAt
        ? { statusUpdatedAt: connection.updatedAt }
        : {}),
      ...(connection?.steps ? { steps: connection.steps } : {}),
      ...(connection?.trustRequest
        ? { trustRequest: connection.trustRequest }
        : {}),
      ...(connection?.error ? { error: connection.error } : {}),
    };
  }

  private _sshConfig(server: RemoteServerConfig): SshRemoteRuntimeConfig {
    return {
      id: this._runtimeId(server.id),
      name: server.name,
      host: server.host,
      user: server.user,
      port: undefined,
      identityFile: undefined,
      extraArgs: [],
      remoteRepo: "",
      remoteInstallDir: server.remoteInstallDir,
      remoteHome: server.remoteHome,
      remoteServerPort: server.remoteServerPort,
      localPort: undefined,
      makeDefault: false,
    };
  }

  private _runtimeId(id: string): RuntimeId {
    return `remote:${id}`;
  }

  private _find(id: string): RemoteServerConfig {
    const server = this._servers.find((item) => item.id === id);
    if (!server) {
      throw new Error(`Remote server not found: ${id}`);
    }
    return server;
  }

  private _assertNotConnected(id: string, action: string): void {
    const status = this._connections.get(id)?.status;
    if (status === "connected" || status === "connecting" || status === "trust-required") {
      throw new Error(`Disconnect remote server before ${action}: ${id}`);
    }
  }

  private _normalizeDraft(
    draft: RemoteServerDraft,
    meta: { id: string; createdAt: number; updatedAt: number }
  ): RemoteServerConfig {
    const name = draft.name.trim();
    const host = draft.host.trim();
    if (!name) throw new Error("Remote server name is required.");
    if (!host) throw new Error("Remote server host is required.");
    return {
      id: meta.id,
      kind: "ssh",
      name,
      host,
      user: _optional(draft.user),
      remoteInstallDir: DEFAULT_REMOTE_INSTALL_DIR,
      remoteHome: "~/.llm-space-server",
      remoteServerPort: 39123,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    };
  }

  private get _configPath(): string {
    return path.join(getSettingsDir(), "remote-servers.json");
  }

  private _load(): RemoteServerConfig[] {
    if (!existsSync(this._configPath)) return [];
    const parsed = JSON.parse(
      readFileSync(this._configPath, "utf8")
    ) as RemoteServersConfigFile;
    return Array.isArray(parsed.servers)
      ? parsed.servers.map((server) => this._normalizeLoadedServer(server))
      : [];
  }

  private _save(): void {
    mkdirSync(getSettingsDir(), { recursive: true });
    writeFileSync(
      this._configPath,
      `${JSON.stringify(
        { version: REMOTE_SERVERS_CONFIG_VERSION, servers: this._servers },
        null,
        2
      )}\n`,
      "utf8"
    );
  }

  private _normalizeLoadedServer(
    server: PersistedRemoteServerConfig
  ): RemoteServerConfig {
    return {
      id: server.id,
      kind: "ssh",
      name: server.name,
      host: server.host,
      user: _optional(server.user),
      remoteInstallDir:
        _optional(server.remoteInstallDir) ?? DEFAULT_REMOTE_INSTALL_DIR,
      remoteHome: _optional(server.remoteHome) ?? "~/.llm-space-server",
      remoteServerPort: _port(
        server.remoteServerPort,
        39123,
        "Remote server port"
      ),
      createdAt: server.createdAt,
      updatedAt: server.updatedAt,
    };
  }

  private _setConnection(
    id: string,
    next: Omit<ConnectedServer, "steps" | "updatedAt"> & {
      updatedAt?: number;
    }
  ): void {
    const current = this._connections.get(id);
    const updatedAt = next.updatedAt ?? Date.now();
    this._connections.set(id, {
      ...next,
      updatedAt,
      steps: _updateConnectionSteps(current?.steps, {
        stage: next.stage,
        status:
          next.status === "error"
            ? "error"
            : next.status === "connected"
              ? "success"
              : "running",
        message: next.error ?? next.stageLabel,
        updatedAt,
      }),
    });
    this._emitStatusChanged();
  }

  private _emitStatusChanged(): void {
    this._onStatusChanged?.({ servers: this.listServers() });
  }
}

function _connectionStage(stage: string): RemoteConnectionStage {
  switch (stage) {
    case "platform-detect":
    case "host-key-check":
    case "server-install":
    case "server-start":
    case "tunnel-start":
    case "health-check":
      return stage;
    default:
      return "ssh-check";
  }
}

const CONNECTION_STEP_LABELS: Record<RemoteConnectionStage, string> = {
  idle: "Idle",
  "ssh-check": "Open SSH",
  "host-key-check": "Host key",
  "platform-detect": "Platform",
  "server-install": "Install runtime",
  "server-start": "Start server",
  "tunnel-start": "Tunnel",
  "health-check": "Health check",
  connected: "Connected",
  error: "Failed",
};

const CONNECTION_FLOW: RemoteConnectionStage[] = [
  "ssh-check",
  "host-key-check",
  "platform-detect",
  "server-install",
  "server-start",
  "tunnel-start",
  "health-check",
  "connected",
];

function _initialConnectionSteps(): RemoteConnectionStepView[] {
  return CONNECTION_FLOW.map((stage) => ({
    stage,
    label: CONNECTION_STEP_LABELS[stage],
    status: "pending",
  }));
}

function _updateConnectionSteps(
  current: RemoteConnectionStepView[] | undefined,
  update: {
    stage: RemoteConnectionStage;
    status: RemoteConnectionStepView["status"];
    message: string;
    updatedAt: number;
  }
): RemoteConnectionStepView[] {
  const steps = current?.length ? current : _initialConnectionSteps();
  const index = steps.findIndex((step) => step.stage === update.stage);
  return steps.map((step, stepIndex) => {
    if (step.stage === update.stage) {
      return {
        ...step,
        status: update.status,
        message: update.message,
        updatedAt: update.updatedAt,
      };
    }
    if (update.status === "running" && index >= 0 && stepIndex < index) {
      return step.status === "pending" || step.status === "running"
        ? { ...step, status: "success", updatedAt: update.updatedAt }
        : step;
    }
    if (update.stage === "connected" && step.status === "running") {
      return { ...step, status: "success", updatedAt: update.updatedAt };
    }
    return step;
  });
}

function _optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function _sameRemoteEndpoint(
  left: RemoteServerConfig,
  right: RemoteServerConfig
): boolean {
  return (
    left.host === right.host &&
    (left.user ?? "") === (right.user ?? "") &&
    left.remoteServerPort === right.remoteServerPort
  );
}

function _port(
  value: number | undefined,
  fallback: number,
  label: string
): number {
  const port = value ?? fallback;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${label} must be an integer between 1 and 65535.`);
  }
  return port;
}
