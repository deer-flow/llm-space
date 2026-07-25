import type { RuntimeId } from "./runtime";

export interface RemoteServerDraft {
  name: string;
  host: string;
  user?: string;
}

export interface RemoteServerConfig extends RemoteServerDraft {
  id: string;
  kind: "ssh";
  remoteInstallDir: string;
  remoteHome: string;
  remoteServerPort: number;
  createdAt: number;
  updatedAt: number;
}

export type RemoteConnectionStage =
  | "idle"
  | "ssh-check"
  | "host-key-check"
  | "platform-detect"
  | "server-install"
  | "server-start"
  | "tunnel-start"
  | "health-check"
  | "connected"
  | "error";

export type RemoteConnectionStepStatus =
  | "pending"
  | "running"
  | "success"
  | "error";

export interface RemoteConnectionStepView {
  stage: RemoteConnectionStage;
  label: string;
  status: RemoteConnectionStepStatus;
  message?: string;
  updatedAt?: number;
}

export interface RemoteHostKeyTrustRequest {
  requestId: string;
  kind: "first-time" | "changed";
  target: string;
  host: string;
  resolvedHost?: string;
  port?: number;
  user?: string;
  keyType: string;
  fingerprint: string;
  knownHostsFile?: string;
  knownHostsLine?: number;
  publicKeyLine?: string;
  rawOutput?: string;
}

export interface RemoteServerView extends RemoteServerConfig {
  runtimeId: RuntimeId;
  status:
    | "connected"
    | "connecting"
    | "disconnected"
    | "error"
    | "trust-required";
  defaultRuntime: boolean;
  stage?: RemoteConnectionStage;
  stageLabel?: string;
  statusUpdatedAt?: number;
  steps?: RemoteConnectionStepView[];
  trustRequest?: RemoteHostKeyTrustRequest;
  error?: string;
}

export interface RemoteServerStatusChangedPayload {
  servers: RemoteServerView[];
}
