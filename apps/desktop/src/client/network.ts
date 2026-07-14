import { electrobun } from "@/lib/electrobun";
import type { NetworkSettings, SystemProxyDetection } from "@/shared/network";

function _rpc() {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  return electrobun.rpc;
}

export async function getNetworkSettings(): Promise<NetworkSettings> {
  return _rpc().request.getNetworkSettings({});
}

export async function setNetworkSettings(
  settings: NetworkSettings
): Promise<NetworkSettings> {
  return _rpc().request.setNetworkSettings({ settings });
}

export async function detectSystemProxy(): Promise<SystemProxyDetection> {
  return _rpc().request.detectSystemProxy({});
}
