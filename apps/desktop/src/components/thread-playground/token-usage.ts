import type { ModelUsage, ModelUsageCost } from "@llm-space/core";

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

function _costBreakdownRows(cost: ModelUsageCost): UsageBreakdownRow[] {
  const total = formatCost(cost.total);
  if (!total) {
    return [];
  }
  return [{ label: "Cost", value: total }];
}
