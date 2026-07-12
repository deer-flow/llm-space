import type {
  Message,
  ModelUsage,
  ModelUsageCost,
  ThreadSnapshot,
} from "../types";

/** Empty usage marker for new runs whose provider omitted usage. */
export function emptyModelUsage(): ModelUsage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

/** Runtime guard for usage read from durable thread files. */
export function isModelUsage(usage: unknown): usage is ModelUsage {
  if (!usage || typeof usage !== "object") {
    return false;
  }
  const candidate = usage as Partial<ModelUsage>;
  return (
    _isUsageNumber(candidate.input) &&
    _isUsageNumber(candidate.output) &&
    _isUsageNumber(candidate.cacheRead) &&
    _isUsageNumber(candidate.cacheWrite) &&
    _isUsageNumber(candidate.totalTokens) &&
    (candidate.reasoning === undefined ||
      _isUsageNumber(candidate.reasoning)) &&
    _isModelUsageCost(candidate.cost)
  );
}

/** True when provider-reported usage contains a value worth retaining. */
export function hasModelUsage(
  usage: ModelUsage | null | undefined
): usage is ModelUsage {
  if (!isModelUsage(usage)) {
    return false;
  }
  return (
    usage.totalTokens > 0 ||
    usage.input > 0 ||
    usage.output > 0 ||
    usage.cacheRead > 0 ||
    usage.cacheWrite > 0 ||
    (usage.reasoning ?? 0) > 0 ||
    _hasCost(usage.cost)
  );
}

export function aggregateThreadUsage(
  thread: ThreadSnapshot
): ModelUsage | null {
  return aggregateMessageUsage(thread.context?.messages ?? []);
}

/** Preserve the legacy fallback for snapshots saved before per-run usage. */
export function usageForRun(run: {
  thread: ThreadSnapshot;
  usage?: ModelUsage | null;
}): ModelUsage | null {
  if (Object.prototype.hasOwnProperty.call(run, "usage")) {
    return hasModelUsage(run.usage) ? run.usage : null;
  }
  return aggregateThreadUsage(run.thread);
}

export function aggregateMessageUsage(messages: Message[]): ModelUsage | null {
  let total: ModelUsage | null = null;
  for (const message of messages) {
    if (message.role !== "assistant" || !hasModelUsage(message.usage)) {
      continue;
    }
    total = total ? addModelUsage(total, message.usage) : message.usage;
  }
  return total;
}

export function aggregateModelUsage(
  usages: readonly ModelUsage[]
): ModelUsage | null {
  let total: ModelUsage | null = null;
  for (const usage of usages) {
    if (!isModelUsage(usage)) {
      continue;
    }
    total = total ? addModelUsage(total, usage) : usage;
  }
  return total;
}

export function addModelUsage(a: ModelUsage, b: ModelUsage): ModelUsage {
  const reasoning = _optionalSum(a.reasoning, b.reasoning);
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    ...(reasoning === undefined ? {} : { reasoning }),
    totalTokens: _totalTokens(a) + _totalTokens(b),
    cost: {
      input: a.cost.input + b.cost.input,
      output: a.cost.output + b.cost.output,
      cacheRead: a.cost.cacheRead + b.cost.cacheRead,
      cacheWrite: a.cost.cacheWrite + b.cost.cacheWrite,
      total: a.cost.total + b.cost.total,
    },
  };
}

function _totalTokens(usage: ModelUsage): number {
  return (
    usage.totalTokens ||
    usage.input + usage.output + usage.cacheRead + usage.cacheWrite
  );
}

function _optionalSum(
  a: number | undefined,
  b: number | undefined
): number | undefined {
  const total = (a ?? 0) + (b ?? 0);
  return a === undefined && b === undefined ? undefined : total;
}

function _hasCost(cost: ModelUsageCost): boolean {
  return (
    cost.input > 0 ||
    cost.output > 0 ||
    cost.cacheRead > 0 ||
    cost.cacheWrite > 0 ||
    cost.total > 0
  );
}

function _isUsageNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function _isModelUsageCost(cost: unknown): cost is ModelUsageCost {
  if (!cost || typeof cost !== "object") {
    return false;
  }
  const candidate = cost as Partial<ModelUsageCost>;
  return (
    _isUsageNumber(candidate.input) &&
    _isUsageNumber(candidate.output) &&
    _isUsageNumber(candidate.cacheRead) &&
    _isUsageNumber(candidate.cacheWrite) &&
    _isUsageNumber(candidate.total)
  );
}
