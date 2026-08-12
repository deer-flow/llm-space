import type { AppTab } from "./use-thread-tabs";

export interface ThreadViewLruTransition {
  /** Thread pane IDs in most-recently-used order. */
  retained: string[];
  /** Pane IDs removed from the previous retained set, in prior MRU order. */
  evicted: string[];
}

/**
 * Reconcile the mounted Thread Views without touching their persistent Sessions.
 * Trace tabs are deliberately invisible to this policy.
 */
export function reconcileThreadViewLru(
  previous: readonly string[],
  tabs: readonly AppTab[],
  activeId: string | null,
  capacity: number
): ThreadViewLruTransition {
  const threadTabs = tabs.filter((tab) => tab.type === "thread");
  const openPaneIds = new Set(threadTabs.map((tab) => tab.paneId));
  const activePaneId = threadTabs.find((tab) => tab.id === activeId)?.paneId;
  const retained: string[] = [];

  if (activePaneId) {
    retained.push(activePaneId);
  }
  for (const paneId of previous) {
    if (
      openPaneIds.has(paneId) &&
      paneId !== activePaneId &&
      !retained.includes(paneId)
    ) {
      retained.push(paneId);
    }
  }

  const bounded = retained.slice(0, Math.max(1, Math.trunc(capacity)));
  const retainedSet = new Set(bounded);
  const evicted = previous.filter(
    (paneId, index) =>
      previous.indexOf(paneId) === index && !retainedSet.has(paneId)
  );

  return { retained: bounded, evicted };
}
