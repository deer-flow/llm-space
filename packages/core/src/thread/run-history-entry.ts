import type {
  ThreadRunReference,
  ThreadRunSnapshot,
} from "../types";

/** A loaded run snapshot with the stable ID required by the application. */
export type RunSnapshot = ThreadRunSnapshot & { id: string };

/** A run represented either by its loaded snapshot or its persisted reference. */
export type RunHistoryEntry = RunSnapshot | ThreadRunReference;

/** Whether a run-history entry currently contains its full thread snapshot. */
export function isRunSnapshot(entry: RunHistoryEntry): entry is RunSnapshot {
  return "thread" in entry;
}
