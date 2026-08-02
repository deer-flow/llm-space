import type { RuntimeId } from "@/shared/runtime";

import type { RuntimeRunTracker } from "./runtime-run-tracker";

export function switchWorkspaceRuntimeIfAllowed({
  tracker,
  currentRuntimeId,
  nextRuntimeId,
  onBlocked,
  onSwitch,
}: {
  tracker: RuntimeRunTracker;
  currentRuntimeId: RuntimeId;
  nextRuntimeId: RuntimeId;
  onBlocked: () => void;
  onSwitch: () => void;
}): boolean {
  if (!tracker.canTransition(currentRuntimeId, nextRuntimeId)) {
    onBlocked();
    return false;
  }
  onSwitch();
  return true;
}
