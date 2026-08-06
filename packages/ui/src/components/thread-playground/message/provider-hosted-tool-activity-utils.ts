import type { ProviderHostedToolActivity, TextContent } from "@llm-space/core";

export interface CitationLink {
  url: string;
  title?: string;
}

export interface ProviderHostedActivitySummary {
  label: string;
  status?: string;
  query?: string;
  sources: CitationLink[];
}

export function normalizeSafeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function _normalizeSources(value: unknown): CitationLink[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: CitationLink[] = [];
  for (const source of value) {
    if (!source || typeof source !== "object") continue;
    const record = source as { url?: unknown; title?: unknown };
    const url = normalizeSafeUrl(record.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push({
      url,
      ...(typeof record.title === "string" ? { title: record.title } : {}),
    });
  }
  return result;
}

export function collectCitations(
  contents: readonly TextContent[]
): CitationLink[] {
  const seen = new Set<string>();
  const result: CitationLink[] = [];
  for (const content of contents) {
    for (const annotation of content.annotations ?? []) {
      const url = normalizeSafeUrl(annotation.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      result.push({
        url,
        ...(annotation.title ? { title: annotation.title } : {}),
      });
    }
  }
  return result;
}

export function summarizeProviderHostedActivity(
  activity: ProviderHostedToolActivity
): ProviderHostedActivitySummary {
  const normalizedSources = _normalizeSources(activity.sources);
  const rawAction =
    activity.raw.action &&
    typeof activity.raw.action === "object" &&
    !Array.isArray(activity.raw.action)
      ? activity.raw.action
      : undefined;
  const rawSources = _normalizeSources(rawAction?.sources);
  const action = activity.action;
  return {
    label: activity.type,
    ...(activity.status ? { status: activity.status } : {}),
    ...(typeof action?.query === "string" ? { query: action.query } : {}),
    sources: normalizedSources.length > 0 ? normalizedSources : rawSources,
  };
}
