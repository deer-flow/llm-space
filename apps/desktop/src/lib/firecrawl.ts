/**
 * Detect the Firecrawl free-tier limit error surfaced by the built-in
 * `web_fetch` / `web_search` tools. Firecrawl returns a human-readable message
 * (e.g. "You've reached today's limit of free, unauthenticated credits for
 * Firecrawl...") which is thrown as an `Error` in `bun/tools/built-in/web.ts`.
 *
 * We feature-match rather than exact-match so wording tweaks on Firecrawl's side
 * don't break detection, while staying specific to quota/credit errors.
 */
export function isFirecrawlLimitError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("firecrawl") && (m.includes("limit") || m.includes("credit"));
}
