import { type ToolCallInput } from "@llm-space/core";
import { GlobeIcon } from "lucide-react";
import { memo, useState } from "react";

import { Link } from "@llm-space/ui/components/link";
import { formatString, useI18n } from "@llm-space/ui/lib/i18n";

interface WebSearchResult {
  title: string;
  url: string;
  snippet?: string;
  content?: string;
}

const DEFAULT_VISIBLE_RESULTS = 4;
const RESULT_DESCRIPTION_LIMIT = 400;
const PARSED_RESULTS_CACHE_LIMIT = 100;
const PARSED_RESULTS_CACHE = new Map<string, WebSearchResult[]>();

function _rememberParsedResults(value: string, results: WebSearchResult[]) {
  PARSED_RESULTS_CACHE.delete(value);
  PARSED_RESULTS_CACHE.set(value, results);
  if (PARSED_RESULTS_CACHE.size > PARSED_RESULTS_CACHE_LIMIT) {
    const oldestValue = PARSED_RESULTS_CACHE.keys().next().value;
    if (oldestValue !== undefined) {
      PARSED_RESULTS_CACHE.delete(oldestValue);
    }
  }
}

function _truncateDescription(value: string | undefined) {
  if (!value || value.length <= RESULT_DESCRIPTION_LIMIT) {
    return value;
  }
  return `${value.slice(0, RESULT_DESCRIPTION_LIMIT).trimEnd()}…`;
}

/**
 * Validate a `web_search` tool call's serialized output (a JSON array of
 * `{ title, url, snippet?, content? }`) and return the normalized results.
 * Returns `null` for any other tool, an empty/partial value, or a malformed
 * payload, so the caller falls back to the plain response editor.
 */
export function parseWebSearchOutput(
  input: ToolCallInput,
  value: string
): WebSearchResult[] | null {
  if (input.name !== "web_search" || value.trim() === "") {
    return null;
  }
  const cachedResults = PARSED_RESULTS_CACHE.get(value);
  if (cachedResults) {
    _rememberParsedResults(value, cachedResults);
    return cachedResults;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return null;
  }

  const results: WebSearchResult[] = [];
  for (const raw of parsed) {
    if (typeof raw !== "object" || raw === null) {
      return null;
    }
    const r = raw as Record<string, unknown>;
    if (typeof r.title !== "string" || typeof r.url !== "string") {
      return null;
    }
    results.push({
      title: r.title,
      url: r.url,
      snippet:
        typeof r.snippet === "string"
          ? _truncateDescription(r.snippet)
          : undefined,
      content:
        typeof r.content === "string"
          ? _truncateDescription(r.content)
          : undefined,
    });
  }
  _rememberParsedResults(value, results);
  return results;
}

/** Human-friendly breadcrumb for a result URL: `host › seg › seg`. */
function _prettyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const segments = parsed.pathname.split("/").filter(Boolean);
    return [host, ...segments].join(" › ");
  } catch {
    return url;
  }
}

/**
 * A read-only, Google-style rendering of `web_search` results. Keep the default
 * DOM small and let the owning message viewport handle vertical scrolling so
 * trackpad momentum does not switch between nested scroll containers.
 */
function _WebSearchResultsView({ results }: { results: WebSearchResult[] }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useI18n();
  const canExpand = results.length > DEFAULT_VISIBLE_RESULTS;
  const visibleResults = expanded
    ? results
    : results.slice(0, DEFAULT_VISIBLE_RESULTS);

  return (
    <div className="flex w-full flex-col gap-4 rounded-lg bg-(--textarea) px-3 py-2.5 select-auto">
      {visibleResults.map((result, index) => (
        <WebSearchResultRow key={index} result={result} />
      ))}
      {canExpand ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground self-start text-xs underline-offset-4 hover:underline"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded
            ? t.playground.message.showFewerResults
            : formatString(t.playground.message.showMoreResults, {
                n: results.length - DEFAULT_VISIBLE_RESULTS,
              })}
        </button>
      ) : null}
    </div>
  );
}
export const WebSearchResultsView = memo(_WebSearchResultsView);

function _WebSearchResultRow({ result }: { result: WebSearchResult }) {
  const description = result.snippet ?? result.content;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <Link
        href={result.url}
        className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs hover:underline"
      >
        <GlobeIcon className="size-3 shrink-0" />
        <span className="truncate">{_prettyUrl(result.url)}</span>
      </Link>
      <Link
        href={result.url}
        className="text-primary line-clamp-2 text-sm font-medium hover:underline"
      >
        {result.title}
      </Link>
      {description ? (
        <p className="text-muted-foreground line-clamp-2 text-xs leading-5">
          {description}
        </p>
      ) : null}
    </div>
  );
}
const WebSearchResultRow = memo(_WebSearchResultRow);
