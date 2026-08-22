import path from "node:path";

import {
  DEFAULT_SEARCH_SETTINGS,
  type SearchProviderId,
  type SearchSettings,
} from "@llm-space/core";
import {
  atomicWriteJsonFileSync,
  getSettingsDir,
  readJsonFileSync,
} from "@llm-space/core/server";
import { z } from "zod";

const VALID_PROVIDERS: readonly SearchProviderId[] = [
  "brave",
  "firecrawl",
  "tavily",
  "searxng",
];

const SearchSettingsFileSchema = z.object({
  provider: z.enum(VALID_PROVIDERS).optional(),
  braveApiKey: z.string().optional(),
  firecrawlApiKey: z.string().optional(),
  tavilyApiKey: z.string().optional(),
  searxngBaseUrl: z.string().optional(),
});

/**
 * Owns `settings/search.json`: the in-memory source of truth for the built-in
 * web tools' search provider and API keys. Mirrors `ModelManager`'s eager,
 * synchronous load-and-seed pattern.
 */
export class SearchSettingsManager {
  private _settings: SearchSettings;

  constructor() {
    this._settings = this._loadConfig();
  }

  get(): SearchSettings {
    return { ...this._settings };
  }

  set(next: SearchSettings): SearchSettings {
    this._settings = this._normalize(next);
    this._saveConfig();
    return this.get();
  }

  private get _configPath(): string {
    return path.join(getSettingsDir(), "search.json");
  }

  private _saveConfig(): void {
    atomicWriteJsonFileSync(this._configPath, this._settings);
  }

  /**
   * Read `settings/search.json`, merging against defaults so partial or missing
   * files stay valid. Seeds the default config on disk when the file is absent.
   */
  private _loadConfig(): SearchSettings {
    const result = readJsonFileSync(this._configPath, {
      schema: SearchSettingsFileSchema,
      recovery: "best-effort",
      fallback: () => ({ ...DEFAULT_SEARCH_SETTINGS }),
      seedMissing: true,
    });
    return this._normalize(result.value);
  }

  private _normalize(input: Partial<SearchSettings>): SearchSettings {
    const provider =
      input.provider && VALID_PROVIDERS.includes(input.provider)
        ? input.provider
        : DEFAULT_SEARCH_SETTINGS.provider;
    return {
      provider,
      braveApiKey:
        typeof input.braveApiKey === "string"
          ? input.braveApiKey
          : DEFAULT_SEARCH_SETTINGS.braveApiKey,
      firecrawlApiKey:
        typeof input.firecrawlApiKey === "string"
          ? input.firecrawlApiKey
          : DEFAULT_SEARCH_SETTINGS.firecrawlApiKey,
      tavilyApiKey:
        typeof input.tavilyApiKey === "string"
          ? input.tavilyApiKey
          : DEFAULT_SEARCH_SETTINGS.tavilyApiKey,
      searxngBaseUrl:
        typeof input.searxngBaseUrl === "string"
          ? input.searxngBaseUrl
          : DEFAULT_SEARCH_SETTINGS.searxngBaseUrl,
    };
  }
}
