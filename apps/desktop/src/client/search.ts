import type { SearchSettings } from "@llm-space/core";

import { electrobun } from "@/lib/electrobun";

function _rpc() {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  return electrobun.rpc;
}

export async function getSearchSettings(): Promise<SearchSettings> {
  return _rpc().request.getSearchSettings({});
}

export async function setSearchSettings(
  settings: SearchSettings
): Promise<SearchSettings> {
  return _rpc().request.setSearchSettings({ settings });
}
