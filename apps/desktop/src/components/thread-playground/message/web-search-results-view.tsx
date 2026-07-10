import { type ToolCallInput } from "@llm-space/core";
import { GlobeIcon } from "lucide-react";
import { memo } from "react";

import { Link } from "@/components/link";

interface WebSearchResult {
  title: string;
  url: string;
  snippet?: string;
  content?: string;
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
      snippet: typeof r.snippet === "string" ? r.snippet : undefined,
      content: typeof r.content === "string" ? r.content : undefined,
    });
  }
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
 * A read-only, Google-style rendering of `web_search` results. Height is capped
 * to match the code editor it replaces, scrolling internally past that.
 */
function _WebSearchResultsView({ results }: { results: WebSearchResult[] }) {
  return (
    <div className="flex max-h-96 w-full flex-col gap-4 overflow-y-auto rounded-lg bg-(--textarea) px-3 py-2.5 select-auto">
      {results.map((result, index) => (
        <WebSearchResultRow key={index} result={result} />
      ))}
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
