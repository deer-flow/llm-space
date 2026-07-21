import type { ModelConfig } from "../types";

/**
 * A reusable, framework-neutral "dynamic workflow" runtime — the same shape as
 * Claude's Workflow scripting surface (`phase()` / `log()` / `agent()` /
 * `parallel()`), but embeddable inside the app. It is UI-independent: progress
 * is reported through an injected callback and the one LLM primitive (`agent()`)
 * is backed by an injected {@link OneShotRunner}, so a host wires in its own
 * transport/model access without this module importing any of it.
 */

/** A phase boundary; subsequent `log`/`agent` events group under `title`. */
export interface WorkflowPhaseEvent {
  type: "phase";
  title: string;
}

/** A free-text progress line under the current phase. */
export interface WorkflowLogEvent {
  type: "log";
  message: string;
}

/** Lifecycle of a single `agent()` call, for progress display. */
export interface WorkflowAgentEvent {
  type: "agent";
  label: string;
  status: "start" | "done" | "error";
}

export type WorkflowEvent =
  | WorkflowPhaseEvent
  | WorkflowLogEvent
  | WorkflowAgentEvent;

/** Receives progress events from a running workflow. */
export type WorkflowReporter = (event: WorkflowEvent) => void;

/** A single non-streaming LLM text generation. */
export interface OneShotRequest {
  systemPrompt?: string;
  userPrompt: string;
  model: ModelConfig;
  signal?: AbortSignal;
}

/** Injected LLM primitive: prompt in → final assistant text out. */
export type OneShotRunner = (request: OneShotRequest) => Promise<string>;

/** Per-call overrides for {@link WorkflowContext.agent}. */
export interface AgentOptions {
  /** Display label for progress; defaults to `"agent"`. */
  label?: string;
  /** Overrides the runtime's default model for this call. */
  model?: ModelConfig;
  /** System prompt for this call. */
  systemPrompt?: string;
}

/**
 * The scripting surface handed to a workflow body. `agent()` calls are bounded
 * by the runtime's concurrency cap; `parallel()` awaits all thunks (a barrier).
 */
export interface WorkflowContext {
  /** Start a new phase; later `log`/`agent` events group under it. */
  phase(title: string): void;
  /** Emit a progress line under the current phase. */
  log(message: string): void;
  /** Run one LLM generation (concurrency-capped). Returns the final text. */
  agent(prompt: string, options?: AgentOptions): Promise<string>;
  /** Run thunks concurrently and await all of them (barrier). */
  parallel<T>(thunks: (() => Promise<T>)[]): Promise<T[]>;
  /** Abort signal for the whole workflow run. */
  readonly signal: AbortSignal;
}
