import type {
  Thread,
  ThreadEvaluation,
  ThreadRunSnapshot,
  ThreadSnapshot,
} from "@llm-space/core";
import { uuid } from "@llm-space/core";

/** Maximum number of snapshots retained, including the current state. */
export const MAX_HISTORY = 100;

/**
 * Soft ceiling on the extra image payload that undo history may pin in memory:
 * base64 bytes of `image_data` that are no longer in the current thread but are
 * still referenced by an older snapshot. When exceeded, the oldest steps are
 * dropped until the retained payload is back under budget. Text-only editing
 * never approaches this — only heavy add/remove of large images does.
 *
 * Measured on base64 string length, which slightly over-estimates the decoded
 * image size (~1.33x), so the real retained bytes stay under this number.
 */
export const MAX_HISTORY_IMAGE_BYTES = 64 * 1024 * 1024;

/** Maximum number of run snapshots retained in `runHistory`. */
export const MAX_RUN_HISTORY = 20;

/** Maximum number of manual evaluation records retained per thread. */
export const MAX_EVALUATIONS = 50;

/**
 * Undo/redo history for a thread, kept separate from the thread object itself.
 *
 * `snapshots` holds successive thread *references* (not deep copies). Because the
 * store mutates the thread immutably (copy-on-write), unchanged substructure —
 * including base64 image content — is shared across snapshots, so the history
 * stays memory-cheap. Undo/redo is an O(1) pointer move.
 *
 * Invariant: `snapshots[index]` is always the current `state.thread`.
 */
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

/** The `image_data` content objects in a thread's user messages. */
function _imageContents(thread: Thread): { data: string }[] {
  const result: { data: string }[] = [];
  const messages = thread.context?.messages;
  if (!messages) {
    return result;
  }
  for (const message of messages) {
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

/**
 * Approximate base64 bytes of image payloads referenced by an older snapshot but
 * no longer present in the current (newest) one — the extra memory the history
 * pins beyond what the live thread already holds. Images shared with the current
 * thread, or shared across snapshots, are counted at most once (by reference).
 */
function _retainedImageBytes(snapshots: Thread[]): number {
  const current = snapshots[snapshots.length - 1];
  if (current === undefined) {
    return 0;
  }
  const live = new Set<unknown>(_imageContents(current));

  const counted = new Set<unknown>();
  let bytes = 0;
  for (let i = 0; i < snapshots.length - 1; i++) {
    const snapshot = snapshots[i];
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

/**
 * Record a new thread snapshot at the history tip, discarding any redo entries.
 * Trims the oldest steps to stay within {@link MAX_HISTORY} steps and, when
 * images are involved, within {@link MAX_HISTORY_IMAGE_BYTES} of pinned image
 * memory. No-ops when the thread is unchanged (same reference).
 */
export function recordSnapshot(
  history: ChangeHistory,
  next: Thread
): ChangeHistory {
  if (next === history.snapshots[history.index]) {
    return history;
  }
  const snapshots = history.snapshots.slice(0, history.index + 1);
  snapshots.push(next);
  // Cap by number of steps.
  if (snapshots.length > MAX_HISTORY) {
    snapshots.splice(0, snapshots.length - MAX_HISTORY);
  }
  // Cap the extra image memory pinned by history. Only runs while over budget
  // (i.e. heavy image churn); always keeps the current state + one undo step.
  while (
    snapshots.length > 2 &&
    _retainedImageBytes(snapshots) > MAX_HISTORY_IMAGE_BYTES
  ) {
    snapshots.shift();
  }
  return { snapshots, index: snapshots.length - 1 };
}

export type RunSnapshot = ThreadRunSnapshot & { id: string };
export type EvaluationRecord = ThreadEvaluation;

/**
 * Create a de-nested thread snapshot for durable run history. The returned
 * object intentionally drops `runHistory`, otherwise each completed run would
 * persist the entire previous timeline inside the new entry.
 */
export function snapshotThread(thread: Thread): ThreadSnapshot {
  const snapshot: ThreadSnapshot = {};
  if (thread.title !== undefined) {
    snapshot.title = thread.title;
  }
  if (thread.model !== undefined) {
    snapshot.model = thread.model;
  }
  if (thread.context !== undefined) {
    snapshot.context = thread.context;
  }
  return snapshot;
}

/** Build a deterministic ID for old timestamp-only runs. */
function _fallbackRunId(run: ThreadRunSnapshot, index: number): string {
  return `run-${Math.trunc(run.timestamp)}-${index}`;
}

/**
 * Normalize persisted run history read from a thread file, trimming malformed
 * timestamps and enforcing the same recent-run cap used for newly recorded runs.
 */
export function normalizeRunHistory(
  runHistory: Thread["runHistory"]
): RunSnapshot[] {
  if (!Array.isArray(runHistory)) {
    return [];
  }
  const normalized = runHistory.flatMap((run, index): RunSnapshot[] => {
    if (!Number.isFinite(run.timestamp)) {
      return [];
    }
    const id =
      typeof run.id === "string" && run.id.trim()
        ? run.id
        : _fallbackRunId(run, index);
    return [
      {
        id,
        timestamp: run.timestamp,
        thread: snapshotThread(run.thread),
      },
    ];
  });
  return normalized.length > MAX_RUN_HISTORY
    ? normalized.slice(normalized.length - MAX_RUN_HISTORY)
    : normalized;
}

/** Check whether a value is a supported persisted evaluation verdict. */
function _isEvaluationVerdict(
  value: unknown
): value is EvaluationRecord["verdict"] {
  return (
    value === "leftBetter" ||
    value === "rightBetter" ||
    value === "tie" ||
    value === "pass" ||
    value === "fail"
  );
}

/**
 * Normalize persisted evaluations and drop records whose compared runs no
 * longer exist in the bounded run history.
 */
export function normalizeEvaluations(
  evaluations: Thread["evaluations"],
  runHistory: RunSnapshot[]
): EvaluationRecord[] {
  if (!Array.isArray(evaluations)) {
    return [];
  }
  const runIds = new Set(runHistory.map((run) => run.id));
  const normalized = evaluations.flatMap((evaluation, index) => {
    if (
      typeof evaluation.leftRunId !== "string" ||
      typeof evaluation.rightRunId !== "string" ||
      !_isEvaluationVerdict(evaluation.verdict) ||
      !Number.isFinite(evaluation.createdAt) ||
      !Number.isFinite(evaluation.updatedAt) ||
      !runIds.has(evaluation.leftRunId) ||
      !runIds.has(evaluation.rightRunId)
    ) {
      return [];
    }
    const id =
      typeof evaluation.id === "string" && evaluation.id.trim()
        ? evaluation.id
        : `evaluation-${evaluation.leftRunId}-${evaluation.rightRunId}-${index}`;
    return [
      {
        id,
        leftRunId: evaluation.leftRunId,
        rightRunId: evaluation.rightRunId,
        verdict: evaluation.verdict,
        note:
          typeof evaluation.note === "string" && evaluation.note.trim()
            ? evaluation.note
            : undefined,
        createdAt: evaluation.createdAt,
        updatedAt: evaluation.updatedAt,
      },
    ];
  });
  return normalized.length > MAX_EVALUATIONS
    ? normalized.slice(normalized.length - MAX_EVALUATIONS)
    : normalized;
}

/**
 * Attach durable run/evaluation records to a thread while omitting empty fields.
 * This keeps old thread files tidy until the user creates these records.
 */
export function withRunHistory(
  thread: Thread,
  runHistory: RunSnapshot[],
  evaluations: EvaluationRecord[] = normalizeEvaluations(
    thread.evaluations,
    normalizeRunHistory(runHistory)
  )
): Thread {
  const normalized = normalizeRunHistory(runHistory);
  const normalizedEvaluations = normalizeEvaluations(evaluations, normalized);
  const next: Thread = snapshotThread(thread);
  if (normalized.length > 0) {
    next.runHistory = normalized;
  }
  if (normalizedEvaluations.length > 0) {
    next.evaluations = normalizedEvaluations;
  }
  return next;
}

/**
 * Append a snapshot of a completed run, keeping only the most recent
 * {@link MAX_RUN_HISTORY}. The thread is stored by reference and shares unchanged
 * substructure with the live thread, so this stays cheap.
 */
export function recordRun(
  runHistory: RunSnapshot[],
  thread: Thread,
  timestamp: number,
  id: string = uuid()
): RunSnapshot[] {
  const next = [
    ...normalizeRunHistory(runHistory),
    { id, thread: snapshotThread(thread), timestamp },
  ];
  return next.length > MAX_RUN_HISTORY
    ? next.slice(next.length - MAX_RUN_HISTORY)
    : next;
}

/** Check whether two left/right run IDs describe the same comparison pair. */
function _isSameRunPair(
  leftRunId: string,
  rightRunId: string,
  otherLeftRunId: string,
  otherRightRunId: string
): boolean {
  return (
    (leftRunId === otherLeftRunId && rightRunId === otherRightRunId) ||
    (leftRunId === otherRightRunId && rightRunId === otherLeftRunId)
  );
}

/**
 * Create or update an evaluation for a run pair. The persisted left/right
 * orientation follows the latest save, but matching is order-insensitive so a
 * reversed A/B selection updates the existing comparison instead of duplicating it.
 */
export function upsertEvaluation(
  evaluations: EvaluationRecord[],
  runHistory: RunSnapshot[],
  input: {
    leftRunId: string;
    rightRunId: string;
    verdict: EvaluationRecord["verdict"];
    note?: string;
  },
  timestamp: number = Date.now()
): EvaluationRecord[] {
  const normalizedRunHistory = normalizeRunHistory(runHistory);
  const normalized = normalizeEvaluations(evaluations, normalizedRunHistory);
  const runIds = new Set(normalizedRunHistory.map((run) => run.id));
  if (
    input.leftRunId === input.rightRunId ||
    !runIds.has(input.leftRunId) ||
    !runIds.has(input.rightRunId)
  ) {
    return normalized;
  }
  const existingIndex = normalized.findIndex(
    (evaluation) =>
      _isSameRunPair(
        evaluation.leftRunId,
        evaluation.rightRunId,
        input.leftRunId,
        input.rightRunId
      )
  );
  const existing =
    existingIndex === -1 ? undefined : normalized[existingIndex];
  const nextEvaluation: EvaluationRecord = {
    id: existing?.id ?? uuid(),
    leftRunId: input.leftRunId,
    rightRunId: input.rightRunId,
    verdict: input.verdict,
    note: input.note?.trim() || undefined,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  const next =
    existingIndex === -1
      ? [...normalized, nextEvaluation]
      : normalized.map((evaluation, index) =>
          index === existingIndex ? nextEvaluation : evaluation
        );
  return next.length > MAX_EVALUATIONS
    ? next.slice(next.length - MAX_EVALUATIONS)
    : next;
}

export function undo(history: ChangeHistory): UndoRedoResult | null {
  if (!canUndo(history)) {
    return null;
  }
  const index = history.index - 1;
  const thread = history.snapshots[index];
  if (thread === undefined) {
    return null;
  }
  return { history: { ...history, index }, thread };
}

export function redo(history: ChangeHistory): UndoRedoResult | null {
  if (!canRedo(history)) {
    return null;
  }
  const index = history.index + 1;
  const thread = history.snapshots[index];
  if (thread === undefined) {
    return null;
  }
  return { history: { ...history, index }, thread };
}
