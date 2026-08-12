import type { RuntimeId } from "@/shared/runtime";

import type { RuntimeRunTracker } from "./runtime-run-tracker";
import type { AppTab } from "./use-thread-tabs";

export function paneIdForTab(tab: AppTab): string {
  return tab.type === "thread" ? tab.paneId : tab.id;
}

function _runIfIdle({
  tracker,
  tabs,
  onBlocked,
  action,
}: {
  tracker: RuntimeRunTracker;
  tabs: AppTab[];
  onBlocked: () => void;
  action: () => void;
}): boolean {
  if (
    tabs.some((tab) =>
      tracker.isMutationReserved(
        paneIdForTab(tab),
        tab.runtimeId,
        tab.type === "thread" ? tab.path : undefined
      )
    )
  ) {
    onBlocked();
    return false;
  }
  const release = tracker.reservePanesForClose(tabs.map(paneIdForTab));
  if (!release) {
    onBlocked();
    return false;
  }
  try {
    action();
    return true;
  } finally {
    release();
  }
}

export function closeTabIfAllowed({
  tracker,
  tabs,
  targetId,
  onBlocked,
  commitViews,
  close,
}: {
  tracker: RuntimeRunTracker;
  tabs: AppTab[];
  targetId: string;
  onBlocked: () => void;
  commitViews: (tabs: AppTab[]) => void;
  close: (id: string) => void;
}): boolean {
  const target = tabs.find((tab) => tab.id === targetId);
  if (!target) return false;
  return _runIfIdle({
    tracker,
    tabs: [target],
    onBlocked,
    action: () => {
      commitViews([target]);
      close(target.id);
    },
  });
}

export function closeOtherTabsIfAllowed({
  tracker,
  tabs,
  keepId,
  runtimeId,
  onBlocked,
  commitViews,
  closeOthers,
}: {
  tracker: RuntimeRunTracker;
  tabs: AppTab[];
  keepId: string;
  runtimeId: RuntimeId;
  onBlocked: () => void;
  commitViews: (tabs: AppTab[]) => void;
  closeOthers: (id: string, runtimeId: RuntimeId) => void;
}): boolean {
  const removed = tabs.filter(
    (tab) => tab.runtimeId === runtimeId && tab.id !== keepId
  );
  return _runIfIdle({
    tracker,
    tabs: removed,
    onBlocked,
    action: () => {
      commitViews(removed);
      closeOthers(keepId, runtimeId);
    },
  });
}

export function closeAllTabsIfAllowed({
  tracker,
  tabs,
  runtimeId,
  onBlocked,
  commitViews,
  closeAll,
}: {
  tracker: RuntimeRunTracker;
  tabs: AppTab[];
  runtimeId: RuntimeId;
  onBlocked: () => void;
  commitViews: (tabs: AppTab[]) => void;
  closeAll: (runtimeId: RuntimeId) => void;
}): boolean {
  const removed = tabs.filter((tab) => tab.runtimeId === runtimeId);
  return _runIfIdle({
    tracker,
    tabs: removed,
    onBlocked,
    action: () => {
      commitViews(removed);
      closeAll(runtimeId);
    },
  });
}

export interface PaneRefreshReservation {
  paneId: string;
  release: () => void;
}

export function refreshTabIfAllowed({
  tracker,
  tabs,
  targetId,
  onBlocked,
  refresh,
}: {
  tracker: RuntimeRunTracker;
  tabs: AppTab[];
  targetId: string;
  onBlocked: () => void;
  refresh: (id: string) => void;
}): PaneRefreshReservation | null {
  const target = tabs.find((tab) => tab.id === targetId);
  if (!target) return null;
  if (
    tracker.isMutationReserved(
      paneIdForTab(target),
      target.runtimeId,
      target.type === "thread" ? target.path : undefined
    )
  ) {
    onBlocked();
    return null;
  }
  const paneId = paneIdForTab(target);
  const release = tracker.reservePanes([paneId]);
  if (!release) {
    onBlocked();
    return null;
  }
  try {
    refresh(target.id);
    return { paneId, release };
  } catch (error) {
    release();
    throw error;
  }
}
