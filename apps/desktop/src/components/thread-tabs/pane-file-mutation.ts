import type { RuntimeId } from "@/shared/runtime";

import { paneIdForTab } from "./pane-mutation-actions";
import type { RuntimeRunTracker } from "./runtime-run-tracker";
import type { AppTab } from "./use-thread-tabs";

export function acquireFileMutationForTabs({
  tracker,
  tabs,
  paths,
  runtimeId,
  onBlocked,
}: {
  tracker: RuntimeRunTracker;
  tabs: AppTab[];
  paths: string[];
  runtimeId: RuntimeId;
  onBlocked: () => void;
}): (() => void) | null {
  const affected = tabs.filter(
    (tab) =>
      tab.type === "thread" &&
      tab.runtimeId === runtimeId &&
      paths.some(
        (path) => tab.path === path || tab.path.startsWith(`${path}/`)
      )
  );
  const release = tracker.reservePaths(
    runtimeId,
    paths,
    affected.map(paneIdForTab)
  );
  if (!release) onBlocked();
  return release;
}
