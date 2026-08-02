import type { AppTab } from "./use-thread-tabs";

/**
 * Remove only the exact restored pane objects that validation found invalid.
 * A same-id pane reopened while validation was pending has a new owner object
 * and must survive. Busy panes are retained so their owner can settle normally.
 */
export function pruneInvalidRestoredTabs(
  current: AppTab[],
  invalidRestored: AppTab[],
  canPrune: (tab: AppTab) => boolean
): AppTab[] {
  const invalid = new Set(invalidRestored);
  return current.filter((tab) => !invalid.has(tab) || !canPrune(tab));
}
