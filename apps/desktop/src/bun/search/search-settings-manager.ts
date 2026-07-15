import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { getSettingsDir } from "@llm-space/core/server";

import {
  DEFAULT_SEARCH_SETTINGS,
  type SearchProviderId,
  type SearchSettings,
} from "../../shared/search";

const VALID_PROVIDERS: readonly SearchProviderId[] = [
  "brave",
  "firecrawl",
  "tavily",
];

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
    mkdirSync(getSettingsDir(), { recursive: true });
    writeFileSync(
      this._configPath,
      `${JSON.stringify(this._settings, null, 2)}\n`,
      "utf8"
    );
  }

  /**
   * Read `settings/search.json`, merging against defaults so partial or missing
   * files stay valid. Seeds the default config on disk when the file is absent.
   */
  private _loadConfig(): SearchSettings {
    try {
      const parsed = JSON.parse(
        readFileSync(this._configPath, "utf8")
      ) as Partial<SearchSettings>;
      return this._normalize(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      const defaults = { ...DEFAULT_SEARCH_SETTINGS };
      mkdirSync(getSettingsDir(), { recursive: true });
      writeFileSync(
        this._configPath,
        `${JSON.stringify(defaults, null, 2)}\n`,
        "utf8"
      );
      return defaults;
    }
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
    };
  }
}
