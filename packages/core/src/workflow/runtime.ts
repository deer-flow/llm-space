import type { ModelConfig } from "../types";

import { Semaphore } from "./semaphore";
import type {
  AgentOptions,
  OneShotRunner,
  WorkflowContext,
  WorkflowReporter,
} from "./types";

/** Default cap on concurrent `agent()` calls. */
const DEFAULT_CONCURRENCY = 4;

export interface CreateWorkflowContextOptions {
  /** Injected LLM primitive backing `agent()`. */
  runOneShot: OneShotRunner;
  /** Fallback model for `agent()` calls that don't pass one. */
  defaultModel?: ModelConfig;
  /** Receives phase/log/agent progress events. */
  report?: WorkflowReporter;
  /** Aborts the whole run; `agent()` rejects once aborted. */
  signal?: AbortSignal;
  /** Max concurrent `agent()` calls (default 4). */
  concurrency?: number;
}

function _throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("Workflow aborted", "AbortError");
  }
}

/**
 * Build a {@link WorkflowContext} for one workflow run. `phase`/`log` forward to
 * `report`; `agent` runs one `runOneShot` under the concurrency cap; `parallel`
 * awaits all thunks (a barrier). Nothing here is UI- or transport-specific.
 */
export function createWorkflowContext({
  runOneShot,
  defaultModel,
  report,
  signal,
  concurrency = DEFAULT_CONCURRENCY,
}: CreateWorkflowContextOptions): WorkflowContext {
  const abort = signal ?? new AbortController().signal;
  const semaphore = new Semaphore(concurrency);

  const agent = async (
    prompt: string,
    options?: AgentOptions
  ): Promise<string> => {
    const model = options?.model ?? defaultModel;
    if (!model) {
      throw new Error("No model available for workflow agent() call.");
    }
    const label = options?.label ?? "agent";
    return semaphore.run(async () => {
      _throwIfAborted(abort);
      report?.({ type: "agent", label, status: "start" });
      try {
        const text = await runOneShot({
          systemPrompt: options?.systemPrompt,
          userPrompt: prompt,
          model,
          signal: abort,
        });
        report?.({ type: "agent", label, status: "done" });
        return text;
      } catch (error) {
        report?.({ type: "agent", label, status: "error" });
        throw error;
      }
    });
  };

  return {
    signal: abort,
    phase: (title) => report?.({ type: "phase", title }),
    log: (message) => report?.({ type: "log", message }),
    agent,
    parallel: <T>(thunks: (() => Promise<T>)[]): Promise<T[]> =>
      Promise.all(thunks.map((thunk) => thunk())),
  };
}
