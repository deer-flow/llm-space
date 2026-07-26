import type { SearchSettings } from "@llm-space/core";

import { electrobun } from "@/lib/electrobun";
import type { RuntimeId } from "@/shared/runtime";

import { runtimeScope } from "./runtime-scope";

function _rpc() {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  return electrobun.rpc;
}

export async function getSearchSettings(
  runtimeId?: RuntimeId
): Promise<SearchSettings> {
  return _rpc().request.getSearchSettings({ ...runtimeScope(runtimeId) });
}

export async function setSearchSettings(
  settings: SearchSettings,
  runtimeId?: RuntimeId
): Promise<SearchSettings> {
  return _rpc().request.setSearchSettings({
    ...runtimeScope(runtimeId),
    settings,
  });
}
