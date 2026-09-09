/** The web-search / web-fetch provider backing the built-in web tools. */
export type SearchProviderId =
  | "brave"
  | "firecrawl"
  | "tavily"
  | "exa"
  | "anysearch"
  | "zhihu";

/**
 * User-configured search settings, persisted to `settings/search.json`. API keys
 * may be a literal value or a `$VAR` reference resolved from the environment (see
 * `bun/tools/built-in/web.ts`), matching the `$VAR` indirection used for model
 * provider keys.
 *
 * `exa` and `anysearch` are MCP-backed providers whose keys are optional (both
 * work anonymously with lower rate limits); `zhihu` is Zhihu's official MCP
 * search and requires an access secret from the Zhihu developer console.
 */
export interface SearchSettings {
  provider: SearchProviderId;
  braveApiKey: string;
  firecrawlApiKey: string;
  tavilyApiKey: string;
  exaApiKey: string;
  anysearchApiKey: string;
  zhihuAccessSecret: string;
}

export const DEFAULT_SEARCH_SETTINGS: SearchSettings = {
  provider: "firecrawl",
  braveApiKey: "$BRAVE_SEARCH_API_KEY",
  firecrawlApiKey: "$FIRECRAWL_API_KEY",
  tavilyApiKey: "$TAVILY_API_KEY",
  exaApiKey: "$EXA_API_KEY",
  anysearchApiKey: "$ANYSEARCH_API_KEY",
  zhihuAccessSecret: "$ZHIHU_ACCESS_SECRET",
};
