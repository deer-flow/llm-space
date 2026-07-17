import type { Thread } from "@llm-space/core";

/** Maximum number of snapshots retained, including the current state. */
export const MAX_HISTORY = 100;

/** Soft ceiling on image payload retained only by desktop undo history. */
export const MAX_HISTORY_IMAGE_BYTES = 64 * 1024 * 1024;

export interface ChangeHistory {
  snapshots: Thread[];
  index: number;
}

export interface UndoRedoResult {
  history: ChangeHistory;
  thread: Thread;
}

export function createInitialHistory(thread: Thread): ChangeHistory {
  return { snapshots: [thread], index: 0 };
}

export function canUndo(history: ChangeHistory): boolean {
  return history.index > 0;
}

export function canRedo(history: ChangeHistory): boolean {
  return history.index < history.snapshots.length - 1;
}

function _imageContents(thread: Thread): { data: string }[] {
  const result: { data: string }[] = [];
  for (const message of thread.context?.messages ?? []) {
    if (message.role !== "user") {
      continue;
    }
    for (const content of message.content) {
      if (content.type === "image_data") {
        result.push(content);
      }
    }
  }
  return result;
}

function _retainedImageBytes(snapshots: Thread[]): number {
  const current = snapshots[snapshots.length - 1];
  if (current === undefined) {
    return 0;
  }
  const live = new Set<unknown>(_imageContents(current));
  const counted = new Set<unknown>();
  let bytes = 0;
  for (let index = 0; index < snapshots.length - 1; index++) {
    const snapshot = snapshots[index];
    if (snapshot === undefined) {
      continue;
    }
    for (const content of _imageContents(snapshot)) {
      if (!live.has(content) && !counted.has(content)) {
        counted.add(content);
        bytes += content.data.length;
      }
    }
  }
  return bytes;
}

export function recordSnapshot(
  history: ChangeHistory,
  next: Thread
): ChangeHistory {
  if (next === history.snapshots[history.index]) {
    return history;
  }
  const snapshots = history.snapshots.slice(0, history.index + 1);
  snapshots.push(next);
  if (snapshots.length > MAX_HISTORY) {
    snapshots.splice(0, snapshots.length - MAX_HISTORY);
  }
  while (
    snapshots.length > 2 &&
    _retainedImageBytes(snapshots) > MAX_HISTORY_IMAGE_BYTES
  ) {
    snapshots.shift();
  }
  return { snapshots, index: snapshots.length - 1 };
}

export function undo(history: ChangeHistory): UndoRedoResult | null {
  if (!canUndo(history)) {
    return null;
  }
  const index = history.index - 1;
  const thread = history.snapshots[index];
  return thread === undefined
    ? null
    : { history: { ...history, index }, thread };
}

export function redo(history: ChangeHistory): UndoRedoResult | null {
  if (!canRedo(history)) {
    return null;
  }
  const index = history.index + 1;
  const thread = history.snapshots[index];
  return thread === undefined
    ? null
    : { history: { ...history, index }, thread };
}
