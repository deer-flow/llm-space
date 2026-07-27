import type {
  RemoteConnectionStage,
  RemoteConnectionStepView,
  RemoteServerView,
} from "@/shared/remote-servers";

const STAGE_SUMMARY: Record<RemoteConnectionStage, string> = {
  idle: "Idle",
  "ssh-check": "SSH",
  "host-key-check": "Host key",
  "platform-detect": "Platform",
  "server-install": "Installing",
  "server-start": "Starting",
  "tunnel-start": "Tunnel",
  "health-check": "Verifying",
  connected: "Connected",
  error: "Failed",
};

export function remoteStageSummary(server: RemoteServerView): string | null {
  if (server.status === "connected") return "Connected";
  if (server.status === "error") return "Failed";
  if (server.status === "trust-required") return "Host key";
  if (server.stage) return STAGE_SUMMARY[server.stage];
  return null;
}

export function remoteConnectionChecked(server: RemoteServerView): boolean {
  return server.status === "connected";
}

export function remoteConnectionDisabled(
  server: RemoteServerView,
  busy: boolean
): boolean {
  return !canConnectRemoteServer(server, busy);
}

export function canConnectRemoteServer(
  server: RemoteServerView,
  busy: boolean
): boolean {
  return (
    !busy &&
    (server.status === "disconnected" || server.status === "error")
  );
}

export function canEditRemoteServer(
  server: RemoteServerView,
  busy: boolean
): boolean {
  return _canMutateRemoteServerConfig(server, busy);
}

export function canRemoveRemoteServer(
  server: RemoteServerView,
  busy: boolean
): boolean {
  return _canMutateRemoteServerConfig(server, busy);
}

export function remoteConnectionFlow(
  server: RemoteServerView
): RemoteConnectionStepView[] {
  if (server.status === "connected") return [];
  return server.steps ?? [];
}

function _canMutateRemoteServerConfig(
  server: RemoteServerView,
  busy: boolean
): boolean {
  return (
    !busy &&
    (server.status === "disconnected" || server.status === "error")
  );
}
