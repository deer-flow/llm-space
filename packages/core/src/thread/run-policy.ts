import type { ThreadRunPolicy } from "../types/threads";

export type { ThreadRunPolicy };

/**
 * Upper bound on model turns in one auto-run. Each turn is one model call
 * (the server terminates the agent loop after tool calls), so this caps how
 * many times a run will auto-execute tools and continue.
 */
export const DEFAULT_THREAD_RUN_MAX_TURNS = 50;

export const DEFAULT_THREAD_RUN_POLICY: ThreadRunPolicy = {
  autoRunTools: false,
  reactLoop: false,
  maxTurns: DEFAULT_THREAD_RUN_MAX_TURNS,
};

/**
 * Build a policy for one run. Enabling the ReAct loop forces tools to auto-run,
 * matching the editor switches.
 */
export function resolveThreadRunPolicy(
  input: {
    autoRunTools?: boolean;
    reactLoop?: boolean;
    maxTurns?: number;
  } = {}
): ThreadRunPolicy {
  const reactLoop = Boolean(input.reactLoop);
  const requestedTurns = input.maxTurns;
  const maxTurns =
    Number.isInteger(requestedTurns) && requestedTurns! >= 1
      ? requestedTurns!
      : DEFAULT_THREAD_RUN_MAX_TURNS;
  return {
    autoRunTools: reactLoop || Boolean(input.autoRunTools),
    reactLoop,
    maxTurns,
  };
}

/** Recover a stored policy; unknown or partial values become `undefined`. */
export function normalizeThreadRunPolicy(
  value: unknown
): ThreadRunPolicy | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.autoRunTools !== "boolean") {
    return undefined;
  }
  if (typeof record.reactLoop !== "boolean") {
    return undefined;
  }
  if (!Number.isInteger(record.maxTurns) || (record.maxTurns as number) < 1) {
    return undefined;
  }
  return {
    autoRunTools: record.autoRunTools,
    reactLoop: record.reactLoop,
    maxTurns: record.maxTurns as number,
  };
}
