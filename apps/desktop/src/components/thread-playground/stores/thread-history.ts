import type {
  ModelUsage,
  Thread,
  ThreadEvaluationCriterion,
  ThreadEvaluation,
  ThreadEvaluationRubric,
  ThreadEvaluationRubricSnapshot,
  ThreadEvaluationRunScores,
  ThreadRunSnapshot,
  ThreadSnapshot,
} from "@llm-space/core";
import { uuid } from "@llm-space/core";

import { emptyModelUsage, isModelUsage } from "../token-usage";

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

/** Maximum number of reusable evaluation rubrics retained per thread. */
export const MAX_EVALUATION_RUBRICS = 20;

/** Minimum and maximum ordered criteria in one V1 rubric. */
export const MIN_RUBRIC_CRITERIA = 2;
export const MAX_RUBRIC_CRITERIA = 6;

export const MAX_RUBRIC_NAME_LENGTH = 80;
export const MAX_CRITERION_NAME_LENGTH = 80;
export const MAX_CRITERION_DESCRIPTION_LENGTH = 240;

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
export type EvaluationCriterion = ThreadEvaluationCriterion;
export type EvaluationRubricRecord = ThreadEvaluationRubric;
export type EvaluationRubricSnapshot = ThreadEvaluationRubricSnapshot;
export type EvaluationRunScores = ThreadEvaluationRunScores;

export interface EvaluationRubricInput {
  id?: string;
  name: string;
  criteria: EvaluationCriterion[];
}

function _asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function _trimmed(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function _trimBounded(value: unknown, maxLength: number): string | null {
  return _trimmed(value)?.slice(0, maxLength) ?? null;
}

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
    const usage =
      Object.prototype.hasOwnProperty.call(run, "usage") &&
      isModelUsage(run.usage)
        ? run.usage
        : undefined;
    return [
      {
        id,
        timestamp: run.timestamp,
        thread: snapshotThread(run.thread),
        ...(usage ? { usage } : {}),
      },
    ];
  });
  const lastIndexById = new Map(
    normalized.map((run, index) => [run.id, index] as const)
  );
  const deduped = normalized.filter(
    (run, index) => lastIndexById.get(run.id) === index
  );
  return deduped.length > MAX_RUN_HISTORY
    ? deduped.slice(deduped.length - MAX_RUN_HISTORY)
    : deduped;
}

function _normalizeCriterion(
  value: unknown,
  seenIds: Set<string>,
  seenNames: Set<string>
): EvaluationCriterion | null {
  const criterion = _asRecord(value);
  if (!criterion) {
    return null;
  }
  const id = _trimmed(criterion.id);
  const name = _trimBounded(criterion.name, MAX_CRITERION_NAME_LENGTH);
  const normalizedName = name?.toLowerCase();
  if (
    !id ||
    !name ||
    !normalizedName ||
    seenIds.has(id) ||
    seenNames.has(normalizedName)
  ) {
    return null;
  }
  seenIds.add(id);
  seenNames.add(normalizedName);
  const description = _trimBounded(
    criterion.description,
    MAX_CRITERION_DESCRIPTION_LENGTH
  );
  return { id, name, ...(description ? { description } : {}) };
}

function _normalizeCriteria(value: unknown): EvaluationCriterion[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const criteria = value
    .flatMap((criterion): EvaluationCriterion[] => {
      const normalized = _normalizeCriterion(criterion, seenIds, seenNames);
      return normalized ? [normalized] : [];
    })
    .slice(0, MAX_RUBRIC_CRITERIA);
  return criteria.length >= MIN_RUBRIC_CRITERIA ? criteria : null;
}

function _normalizeRubricSnapshot(
  value: unknown
): EvaluationRubricSnapshot | null {
  const rubric = _asRecord(value);
  if (!rubric) {
    return null;
  }
  const id = _trimmed(rubric.id);
  const name = _trimBounded(rubric.name, MAX_RUBRIC_NAME_LENGTH);
  const criteria = _normalizeCriteria(rubric.criteria);
  if (
    !id ||
    !name ||
    !criteria ||
    !Number.isSafeInteger(rubric.revision) ||
    (rubric.revision as number) < 1
  ) {
    return null;
  }
  return {
    id,
    name,
    criteria,
    revision: rubric.revision as number,
  };
}

function _normalizeEvaluationRubric(
  value: unknown
): EvaluationRubricRecord | null {
  const rubric = _asRecord(value);
  const snapshot = _normalizeRubricSnapshot(value);
  if (
    !rubric ||
    !snapshot ||
    !Number.isFinite(rubric.createdAt) ||
    !Number.isFinite(rubric.updatedAt)
  ) {
    return null;
  }
  return {
    ...snapshot,
    createdAt: rubric.createdAt as number,
    updatedAt: rubric.updatedAt as number,
  };
}

/** Normalize bounded thread-owned rubric definitions read from disk. */
export function normalizeEvaluationRubrics(
  rubrics: Thread["evaluationRubrics"]
): EvaluationRubricRecord[] {
  if (!Array.isArray(rubrics)) {
    return [];
  }
  const normalized: EvaluationRubricRecord[] = [];
  const indexById = new Map<string, number>();
  for (const value of rubrics as unknown[]) {
    const rubric = _normalizeEvaluationRubric(value);
    if (!rubric) {
      continue;
    }
    const existingIndex = indexById.get(rubric.id);
    if (existingIndex === undefined) {
      indexById.set(rubric.id, normalized.length);
      normalized.push(rubric);
    } else {
      normalized[existingIndex] = rubric;
    }
  }
  return normalized.length > MAX_EVALUATION_RUBRICS
    ? normalized.slice(normalized.length - MAX_EVALUATION_RUBRICS)
    : normalized;
}

/** Copy the durable structure of a definition into an evaluation record. */
export function snapshotEvaluationRubric(
  rubric: EvaluationRubricRecord
): EvaluationRubricSnapshot {
  return {
    id: rubric.id,
    name: rubric.name,
    revision: rubric.revision,
    criteria: rubric.criteria.map((criterion) => ({ ...criterion })),
  };
}

function _sameCriteria(
  left: EvaluationCriterion[],
  right: EvaluationCriterion[]
): boolean {
  return (
    left.length === right.length &&
    left.every((criterion, index) => {
      const other = right[index];
      return (
        criterion.id === other?.id &&
        criterion.name === other.name &&
        criterion.description === other.description
      );
    })
  );
}

/** Create or update one reusable rubric definition. */
export function upsertEvaluationRubric(
  rubrics: EvaluationRubricRecord[],
  input: EvaluationRubricInput,
  timestamp: number = Date.now()
): {
  rubric: EvaluationRubricRecord;
  rubrics: EvaluationRubricRecord[];
} | null {
  const normalized = normalizeEvaluationRubrics(rubrics);
  const name = _trimBounded(input.name, MAX_RUBRIC_NAME_LENGTH);
  const criteria = _normalizeCriteria(input.criteria);
  if (
    !name ||
    criteria?.length !== input.criteria.length ||
    !Number.isFinite(timestamp)
  ) {
    return null;
  }
  const existingIndex = input.id
    ? normalized.findIndex((rubric) => rubric.id === input.id)
    : -1;
  if (input.id && existingIndex === -1) {
    return null;
  }
  if (!input.id && normalized.length >= MAX_EVALUATION_RUBRICS) {
    return null;
  }
  const existing = existingIndex === -1 ? undefined : normalized[existingIndex];
  if (existing?.revision === Number.MAX_SAFE_INTEGER) {
    return null;
  }
  if (existing?.name === name && _sameCriteria(existing.criteria, criteria)) {
    return { rubric: existing, rubrics: normalized };
  }
  const rubric: EvaluationRubricRecord = {
    id: existing?.id ?? uuid(),
    name,
    criteria,
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  const next =
    existingIndex === -1
      ? [...normalized, rubric]
      : normalized.map((value, index) =>
          index === existingIndex ? rubric : value
        );
  return { rubric, rubrics: next };
}

function _normalizeRunScores(
  value: unknown,
  rubric: EvaluationRubricSnapshot,
  leftRunId: string,
  rightRunId: string
): EvaluationRunScores[] | null {
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }
  const allowedRunIds = new Set([leftRunId, rightRunId]);
  const scoreByRunId = new Map<string, Map<string, number>>();
  for (const rawRunScores of value) {
    const runScores = _asRecord(rawRunScores);
    const runId = _trimmed(runScores?.runId);
    if (
      !runScores ||
      !runId ||
      !allowedRunIds.has(runId) ||
      scoreByRunId.has(runId) ||
      !Array.isArray(runScores.scores) ||
      runScores.scores.length !== rubric.criteria.length
    ) {
      return null;
    }
    const scores = new Map<string, number>();
    for (const rawScore of runScores.scores) {
      const score = _asRecord(rawScore);
      const criterionId = _trimmed(score?.criterionId);
      if (
        !score ||
        !criterionId ||
        scores.has(criterionId) ||
        !Number.isInteger(score.score) ||
        (score.score as number) < 1 ||
        (score.score as number) > 5
      ) {
        return null;
      }
      scores.set(criterionId, score.score as number);
    }
    scoreByRunId.set(runId, scores);
  }
  const criterionIds = new Set(
    rubric.criteria.map((criterion) => criterion.id)
  );
  if (
    scoreByRunId.size !== 2 ||
    [...scoreByRunId.values()].some(
      (scores) =>
        scores.size !== criterionIds.size ||
        [...scores.keys()].some((criterionId) => !criterionIds.has(criterionId))
    )
  ) {
    return null;
  }
  return [leftRunId, rightRunId].map((runId) => {
    const scores = scoreByRunId.get(runId)!;
    return {
      runId,
      scores: rubric.criteria.map((criterion) => ({
        criterionId: criterion.id,
        score: scores.get(criterion.id)!,
      })),
    };
  });
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
  const normalized = (evaluations as unknown[]).flatMap(
    (value, index): EvaluationRecord[] => {
      const evaluation = _asRecord(value);
      if (
        !evaluation ||
        typeof evaluation.leftRunId !== "string" ||
        typeof evaluation.rightRunId !== "string" ||
        evaluation.leftRunId === evaluation.rightRunId ||
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
      const hasStructuredPayload =
        Object.prototype.hasOwnProperty.call(evaluation, "rubric") ||
        Object.prototype.hasOwnProperty.call(evaluation, "runScores");
      const rubric = hasStructuredPayload
        ? _normalizeRubricSnapshot(evaluation.rubric)
        : null;
      const runScores = rubric
        ? _normalizeRunScores(
            evaluation.runScores,
            rubric,
            evaluation.leftRunId,
            evaluation.rightRunId
          )
        : null;
      const base = {
        id,
        leftRunId: evaluation.leftRunId,
        rightRunId: evaluation.rightRunId,
        verdict: evaluation.verdict,
        note:
          typeof evaluation.note === "string" && evaluation.note.trim()
            ? evaluation.note.trim()
            : undefined,
        createdAt: evaluation.createdAt as number,
        updatedAt: evaluation.updatedAt as number,
      };
      return rubric && runScores ? [{ ...base, rubric, runScores }] : [base];
    }
  );
  const seenIds = new Set<string>();
  const seenPairs = new Set<string>();
  const deduped: EvaluationRecord[] = [];
  for (let index = normalized.length - 1; index >= 0; index--) {
    const evaluation = normalized[index];
    const pairKey = JSON.stringify(
      [evaluation.leftRunId, evaluation.rightRunId].sort()
    );
    if (seenIds.has(evaluation.id) || seenPairs.has(pairKey)) {
      continue;
    }
    seenIds.add(evaluation.id);
    seenPairs.add(pairKey);
    deduped.push(evaluation);
  }
  deduped.reverse();
  return deduped.length > MAX_EVALUATIONS
    ? deduped.slice(deduped.length - MAX_EVALUATIONS)
    : deduped;
}

/**
 * Attach durable run/evaluation records to a thread while omitting empty fields.
 * This keeps old thread files tidy until the user creates these records.
 */
export function withRunMetadata(
  thread: Thread,
  {
    runHistory,
    evaluations = normalizeEvaluations(
      thread.evaluations,
      normalizeRunHistory(runHistory)
    ),
    evaluationRubrics = normalizeEvaluationRubrics(thread.evaluationRubrics),
  }: {
    runHistory: RunSnapshot[];
    evaluations?: EvaluationRecord[];
    evaluationRubrics?: EvaluationRubricRecord[];
  }
): Thread {
  const normalized = normalizeRunHistory(runHistory);
  const normalizedEvaluations = normalizeEvaluations(evaluations, normalized);
  const normalizedRubrics = normalizeEvaluationRubrics(evaluationRubrics);
  const next: Thread = snapshotThread(thread);
  if (normalized.length > 0) {
    next.runHistory = normalized;
  }
  if (normalizedEvaluations.length > 0) {
    next.evaluations = normalizedEvaluations;
  }
  if (normalizedRubrics.length > 0) {
    next.evaluationRubrics = normalizedRubrics;
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
  options: { id?: string; usage?: ModelUsage | null } = {}
): RunSnapshot[] {
  const usage = options.usage ?? emptyModelUsage();
  const next = [
    ...normalizeRunHistory(runHistory),
    {
      id: options.id ?? uuid(),
      thread: snapshotThread(thread),
      timestamp,
      usage,
    },
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
    rubric?: EvaluationRubricSnapshot;
    runScores?: EvaluationRunScores[];
  },
  timestamp: number = Date.now()
): EvaluationRecord[] | null {
  const normalizedRunHistory = normalizeRunHistory(runHistory);
  const normalized = normalizeEvaluations(evaluations, normalizedRunHistory);
  const runIds = new Set(normalizedRunHistory.map((run) => run.id));
  if (
    input.leftRunId === input.rightRunId ||
    !runIds.has(input.leftRunId) ||
    !runIds.has(input.rightRunId)
  ) {
    return null;
  }
  const hasStructuredPayload =
    input.rubric !== undefined || input.runScores !== undefined;
  const rubric = hasStructuredPayload
    ? _normalizeRubricSnapshot(input.rubric)
    : null;
  const runScores = rubric
    ? _normalizeRunScores(
        input.runScores,
        rubric,
        input.leftRunId,
        input.rightRunId
      )
    : null;
  if (hasStructuredPayload && (!rubric || !runScores)) {
    return null;
  }
  const existingIndex = normalized.findIndex((evaluation) =>
    _isSameRunPair(
      evaluation.leftRunId,
      evaluation.rightRunId,
      input.leftRunId,
      input.rightRunId
    )
  );
  const existing = existingIndex === -1 ? undefined : normalized[existingIndex];
  const baseEvaluation = {
    id: existing?.id ?? uuid(),
    leftRunId: input.leftRunId,
    rightRunId: input.rightRunId,
    verdict: input.verdict,
    note: input.note?.trim() || undefined,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  const nextEvaluation: EvaluationRecord =
    rubric && runScores
      ? { ...baseEvaluation, rubric, runScores }
      : baseEvaluation;

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
