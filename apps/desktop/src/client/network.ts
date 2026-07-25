import type { NetworkSettings, SystemProxyDetection } from "@llm-space/core";

import { electrobun } from "@/lib/electrobun";
import type { RuntimeId } from "@/shared/runtime";

import { runtimeScope } from "./runtime-scope";

function _rpc() {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  return electrobun.rpc;
}

export async function getNetworkSettings(
  runtimeId?: RuntimeId
): Promise<NetworkSettings> {
  return _rpc().request.getNetworkSettings({ ...runtimeScope(runtimeId) });
}

export async function setNetworkSettings(
  settings: NetworkSettings,
  runtimeId?: RuntimeId
): Promise<NetworkSettings> {
  return _rpc().request.setNetworkSettings({
    ...runtimeScope(runtimeId),
    settings,
  });
}

export async function detectSystemProxy(
  runtimeId?: RuntimeId
): Promise<SystemProxyDetection> {
  return _rpc().request.detectSystemProxy({ ...runtimeScope(runtimeId) });
}
