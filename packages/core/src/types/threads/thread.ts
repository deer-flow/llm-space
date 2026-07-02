import { Type, type Static } from "typebox";

import { Message } from "../messages";
import { ModelConfig } from "../models";
import { Tool } from "../tools";

/**
 * The context of a thread, including the system prompt, messages, and tools.
 */
export const ThreadContext = Type.Object({
  /**
   * The system prompt of the thread.
   */
  systemPrompt: Type.Optional(Type.String()),

  /**
   * The tools of the thread.
   */
  tools: Type.Optional(Type.Array(Tool)),

  /**
   * The messages of the thread.
   */
  messages: Type.Optional(Type.Array(Message)),
});
export type ThreadContext = Static<typeof ThreadContext>;

const THREAD_FIELDS = {
  /**
   * The title of the thread.
   */
  title: Type.Optional(Type.String()),

  /**
   * The model configuration of the thread. Optional — a thread may be created
   * without a model; the UI resolves a fallback (first available model) for
   * display/running and only persists a model once the user picks one.
   */
  model: Type.Optional(ModelConfig),

  /**
   * The context of the thread, including the system prompt, messages, and tools.
   */
  context: Type.Optional(ThreadContext),
};

/**
 * A completed-run snapshot of a thread. It intentionally excludes `runHistory`
 * so persisted run history cannot recursively contain itself.
 */
export const ThreadSnapshot = Type.Object(THREAD_FIELDS);
export type ThreadSnapshot = Static<typeof ThreadSnapshot>;

/**
 * A completed run in a thread's durable debug timeline.
 */
export const ThreadRunSnapshot = Type.Object({
  /**
   * Stable ID for referencing this run from evaluation records. Older files may
   * not have one; the desktop store backfills a deterministic ID on load.
   */
  id: Type.Optional(Type.String()),

  /**
   * Thread state captured when the run completed.
   */
  thread: ThreadSnapshot,

  /**
   * Epoch milliseconds (`Date.now()`) when the run completed.
   */
  timestamp: Type.Number(),
});
export type ThreadRunSnapshot = Static<typeof ThreadRunSnapshot>;

export const ThreadEvaluationVerdict = Type.Union([
  Type.Literal("leftBetter"),
  Type.Literal("rightBetter"),
  Type.Literal("tie"),
  Type.Literal("pass"),
  Type.Literal("fail"),
]);
export type ThreadEvaluationVerdict = Static<
  typeof ThreadEvaluationVerdict
>;

/**
 * A manual evaluation verdict comparing two durable run snapshots.
 */
export const ThreadEvaluation = Type.Object({
  /**
   * Stable ID for updating this evaluation record.
   */
  id: Type.String(),

  /**
   * The run shown on the left side of the comparison.
   */
  leftRunId: Type.String(),

  /**
   * The run shown on the right side of the comparison.
   */
  rightRunId: Type.String(),

  /**
   * User's verdict for this comparison.
   */
  verdict: ThreadEvaluationVerdict,

  /**
   * Optional human note explaining the decision.
   */
  note: Type.Optional(Type.String()),

  /**
   * Epoch milliseconds when the evaluation was created.
   */
  createdAt: Type.Number(),

  /**
   * Epoch milliseconds when the evaluation was last updated.
   */
  updatedAt: Type.Number(),
});
export type ThreadEvaluation = Static<typeof ThreadEvaluation>;

/**
 * The definition of a thread.
 */
export const Thread = Type.Object({
  ...THREAD_FIELDS,

  /**
   * Recent completed runs for debugging and replay. Entries are bounded by the
   * desktop store and store de-nested thread snapshots.
   */
  runHistory: Type.Optional(Type.Array(ThreadRunSnapshot)),

  /**
   * Manual evaluations created by comparing durable run snapshots.
   */
  evaluations: Type.Optional(Type.Array(ThreadEvaluation)),
});
export type Thread = Static<typeof Thread>;
