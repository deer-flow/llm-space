import { electrobun } from "@/lib/electrobun";
import type { AnalyticsStatus } from "@/shared/analytics";

function _rpc() {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  return electrobun.rpc;
}

export async function getAnalyticsSettings(): Promise<AnalyticsStatus> {
  return _rpc().request.getAnalyticsSettings({});
}

export async function setAnalyticsSettings(
  enabled: boolean
): Promise<AnalyticsStatus> {
  return _rpc().request.setAnalyticsSettings({ enabled });
}
