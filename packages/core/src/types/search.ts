/** The web-search / web-fetch provider backing the built-in web tools. */
export type SearchProviderId = "brave" | "firecrawl" | "tavily" | "searxng";

/**
 * User-configured search settings, persisted to `settings/search.json`. API keys
 * may be a literal value or a `$VAR` reference resolved from the environment (see
 * `bun/tools/built-in/web.ts`), matching the `$VAR` indirection used for model
 * provider keys.
 */
export interface SearchSettings {
  provider: SearchProviderId;
  braveApiKey: string;
  firecrawlApiKey: string;
  tavilyApiKey: string;
  /** Base URL of the self-hosted SearXNG instance (JSON API), e.g. http://localhost:8080. */
  searxngBaseUrl: string;
}

export const DEFAULT_SEARCH_SETTINGS: SearchSettings = {
  provider: "firecrawl",
  braveApiKey: "$BRAVE_SEARCH_API_KEY",
  firecrawlApiKey: "$FIRECRAWL_API_KEY",
  tavilyApiKey: "$TAVILY_API_KEY",
  searxngBaseUrl: "http://localhost:8080",
};
