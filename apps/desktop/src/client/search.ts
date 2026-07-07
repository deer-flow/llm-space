import { electrobun } from "@/lib/electrobun";
import type { SearchSettings } from "@/shared/search";

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
