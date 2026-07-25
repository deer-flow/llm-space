import { electrobun } from "@/lib/electrobun";
import type {
  RemoteServerDraft,
  RemoteServerStatusChangedPayload,
  RemoteServerView,
} from "@/shared/remote-servers";
import type { RuntimeId, RuntimeView } from "@/shared/runtime";

const REMOTE_SERVERS_CHANGED_EVENT = "llm-space:remote-servers-changed";

export function notifyRemoteServersChanged(servers?: RemoteServerView[]): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(REMOTE_SERVERS_CHANGED_EVENT, { detail: { servers } })
  );
}

export function subscribeRemoteServersChanged(
  listener: (servers?: RemoteServerView[]) => void
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handle = (event: Event) => {
    listener(
      (event as CustomEvent<{ servers?: RemoteServerView[] }>).detail?.servers
    );
  };
  window.addEventListener(REMOTE_SERVERS_CHANGED_EVENT, handle);
  return () => window.removeEventListener(REMOTE_SERVERS_CHANGED_EVENT, handle);
}

export function subscribeRemoteServerStatusChanged(
  listener: (payload: RemoteServerStatusChangedPayload) => void
): () => void {
  const rpc = _rpc();
  const handle = (payload: RemoteServerStatusChangedPayload) => {
    notifyRemoteServersChanged(payload.servers);
    listener(payload);
  };
  rpc.addMessageListener("remoteServerStatusChanged", handle);
  return () => rpc.removeMessageListener("remoteServerStatusChanged", handle);
}

function _rpc() {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  return electrobun.rpc;
}

export function listRuntimes(): Promise<RuntimeView[]> {
  return _rpc().request.listRuntimes({});
}

export function listRemoteServers(): Promise<RemoteServerView[]> {
  return _rpc().request.remoteListServers({});
}

export function addRemoteServer(
  server: RemoteServerDraft
): Promise<RemoteServerView[]> {
  return _notifyAfter(_rpc().request.remoteAddServer({ server }));
}

export function updateRemoteServer(
  serverId: string,
  server: RemoteServerDraft
): Promise<RemoteServerView[]> {
  return _notifyAfter(_rpc().request.remoteUpdateServer({ serverId, server }));
}

export function removeRemoteServer(
  serverId: string
): Promise<RemoteServerView[]> {
  return _notifyAfter(_rpc().request.remoteRemoveServer({ serverId }));
}

export function connectRemoteServer(
  serverId: string
): Promise<RemoteServerView[]> {
  return _notifyAfter(_rpc().request.remoteConnectServer({ serverId }));
}

export function trustRemoteServerHostKey(
  serverId: string,
  requestId: string
): Promise<RemoteServerView[]> {
  return _notifyAfter(
    _rpc().request.remoteTrustServerHostKey({ serverId, requestId })
  );
}

export function rejectRemoteServerHostKey(
  serverId: string,
  requestId: string
): Promise<RemoteServerView[]> {
  return _notifyAfter(
    _rpc().request.remoteRejectServerHostKey({ serverId, requestId })
  );
}

export function disconnectRemoteServer(
  serverId: string
): Promise<RemoteServerView[]> {
  return _notifyAfter(_rpc().request.remoteDisconnectServer({ serverId }));
}

export function setDefaultRuntime(
  runtimeId: RuntimeId
): Promise<RemoteServerView[]> {
  return _notifyAfter(_rpc().request.remoteSetDefaultRuntime({ runtimeId }));
}

export async function getDefaultRuntime(): Promise<RuntimeId> {
  const { runtimeId } = await _rpc().request.remoteGetDefaultRuntime({});
  return runtimeId;
}

async function _notifyAfter<T>(promise: Promise<T>): Promise<T> {
  const result = await promise;
  notifyRemoteServersChanged();
  return result;
}
