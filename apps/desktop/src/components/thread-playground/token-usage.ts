import type {
  Message,
  ModelUsage,
  ModelUsageCost,
  ThreadSnapshot,
} from "@llm-space/core";

const INTEGER_FORMATTER = new Intl.NumberFormat("en", {
  maximumFractionDigits: 0,
});

const COMPACT_FORMATTER = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export interface UsageBreakdownRow {
  label: string;
  value: string;
}

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

/**
 * Runtime guard for persisted usage.
 *
 * Thread JSON can outlive this build, so UI helpers should reject malformed
 * usage records before reading nested cost fields.
 */
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

/** True when an assistant message has provider-reported usage worth showing. */
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

/** Sum provider usage across every assistant/model step in a thread snapshot. */
export function aggregateThreadUsage(
  thread: ThreadSnapshot
): ModelUsage | null {
  return aggregateMessageUsage(thread.context?.messages ?? []);
}

/**
 * Usage displayed for a saved run. New snapshots store the run's own delta; old
 * snapshots fall back to summing their whole thread so older files still show a
 * best-effort value instead of going blank.
 */
export function usageForRun(run: {
  thread: ThreadSnapshot;
  usage?: ModelUsage | null;
}): ModelUsage | null {
  // Presence matters: new run snapshots store an empty usage marker when the
  // provider omitted usage, while old snapshots have no `usage` field at all.
  // Only old snapshots should fall back to cumulative thread aggregation.
  if (Object.prototype.hasOwnProperty.call(run, "usage")) {
    return hasModelUsage(run.usage) ? run.usage : null;
  }
  return aggregateThreadUsage(run.thread);
}

/** Sum provider usage across assistant messages, skipping unavailable usage. */
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

/** Add two provider usage records without changing either input object. */
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

/** Short label for dense rows such as Run history. */
export function formatCompactUsage(usage: ModelUsage): string {
  const cost = formatCost(usage.cost.total);
  const parts = [
    `${COMPACT_FORMATTER.format(usage.input)} in`,
    `${COMPACT_FORMATTER.format(usage.output)} out`,
    ..._cacheSummaryParts(usage, (tokens) => COMPACT_FORMATTER.format(tokens)),
  ];
  if (cost) {
    parts.push(cost);
  }
  return parts.join(" / ");
}

/** Human-readable one-line usage summary. */
export function formatUsageSummary(usage: ModelUsage): string {
  const cost = formatCost(usage.cost.total);
  const parts = [
    `${formatTokens(_totalTokens(usage))} tokens`,
    `${formatTokens(usage.input)} input`,
    `${formatTokens(usage.output)} output`,
    ..._reasoningSummaryParts(usage, formatTokens),
    ..._cacheSummaryParts(usage, formatTokens),
  ];
  if (cost) {
    parts.push(cost);
  }
  return parts.join(" / ");
}

/** Token count with thousands separators. */
export function formatTokens(tokens: number): string {
  return INTEGER_FORMATTER.format(Math.max(0, Math.round(tokens)));
}

/** Cost label, omitted for zero or unavailable provider cost. */
export function formatCost(cost: number | undefined): string | null {
  if (!cost || !Number.isFinite(cost) || cost <= 0) {
    return null;
  }
  if (cost >= 1) {
    return `$${cost.toFixed(2)}`;
  }
  if (cost >= 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(6)}`;
}

/** Detailed rows for usage tooltips and trace summaries. */
export function usageBreakdownRows(usage: ModelUsage): UsageBreakdownRow[] {
  const rows: UsageBreakdownRow[] = [
    { label: "Input", value: `${formatTokens(usage.input)} tokens` },
    { label: "Output", value: `${formatTokens(usage.output)} tokens` },
  ];
  if (usage.cacheRead > 0) {
    rows.push({
      label: "Cache Read",
      value: `${formatTokens(usage.cacheRead)} tokens`,
    });
  }
  if (usage.cacheWrite > 0) {
    rows.push({
      label: "Cache Write",
      value: `${formatTokens(usage.cacheWrite)} tokens`,
    });
  }
  if ((usage.reasoning ?? 0) > 0) {
    rows.push({
      label: "Reasoning",
      value: `${formatTokens(usage.reasoning ?? 0)} tokens`,
    });
  }
  const costRows = _costBreakdownRows(usage.cost);
  if (costRows.length > 0) {
    rows.push(...costRows);
  }
  rows.push({
    label: "Total",
    value: `${formatTokens(_totalTokens(usage))} tokens`,
  });
  return rows;
}

function _totalTokens(usage: ModelUsage): number {
  // Some providers report `totalTokens` directly, while others leave it at 0
  // and only provide components. Prefer the provider total when present so
  // OpenAI-style totals keep their provider-defined accounting.
  return (
    usage.totalTokens ||
    usage.input + usage.output + usage.cacheRead + usage.cacheWrite
  );
}

function _cacheSummaryParts(
  usage: ModelUsage,
  formatter: (tokens: number) => string
): string[] {
  // Keep the visible summary provider-portable: cache retention splits are
  // folded into cache-write totals instead of becoming separate row vocabulary.
  const parts: string[] = [];
  if (usage.cacheRead > 0) {
    parts.push(`${formatter(usage.cacheRead)} cached`);
  }
  if (usage.cacheWrite > 0) {
    parts.push(`${formatter(usage.cacheWrite)} cache write`);
  }
  return parts;
}

function _reasoningSummaryParts(
  usage: ModelUsage,
  formatter: (tokens: number) => string
): string[] {
  const reasoning = usage.reasoning ?? 0;
  return reasoning > 0 ? [`${formatter(reasoning)} reasoning`] : [];
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

function _costBreakdownRows(cost: ModelUsageCost): UsageBreakdownRow[] {
  const total = formatCost(cost.total);
  if (!total) {
    return [];
  }
  return [{ label: "Cost", value: total }];
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
