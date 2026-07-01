import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { env } from "node:process";

import {
  createModels,
  type Models,
  type Provider,
} from "@earendil-works/pi-ai";
import { ModelProviderGroup } from "@llm-space/core";
import { getSettingsDir } from "@llm-space/core/server";

import {
  BUILTIN_PROVIDER_META,
  BUILTIN_PROVIDERS,
} from "./providers/builtin-providers";
import type { ModelsConfig } from "./types";

/**
 * Owns `settings/models.json`: the single in-memory source of truth for the
 * configured providers. The renderer caches nothing and reads through RPC, so
 * this class loads the file once and serves reads from memory.
 *
 * The config is read eagerly (constructor) and kept resident. The `Models`
 * registry — the only build that costs anything (`createModels()` +
 * `setProvider()` + provider instantiation) — is built lazily on first use and
 * cached. A future config mutation just nulls `_models` to rebuild once on the
 * next access.
 */
export class ModelManager {
  private readonly _config: ModelsConfig;
  private _models: Models | null = null;

  constructor() {
    this._config = this._loadConfig();
  }

  /** The `Models` registry of configured providers. Built once, then cached. */
  async getAvailableModels(): Promise<Models> {
    return (this._models ??= await Promise.resolve(this._buildModels()));
  }

  async getBuiltinProviders(): Promise<ModelProviderGroup[]> {
    const detected = await this._detectProviders();
    return Object.values(BUILTIN_PROVIDERS).map((provider) => ({
      id: provider.id,
      name: provider.name,
      models: [],
      apiKeyDetected: detected.includes(provider.id),
      websiteURL: this.getWebsiteLink(provider.id),
    }));
  }

  /** Add a builtin provider to `settings/models.json`. */
  addBuiltInProvider({ id, apiKey }: { id: string; apiKey?: string }): void {
    if (!(id in BUILTIN_PROVIDERS)) {
      throw new Error(`Unknown builtin provider: ${id}`);
    }

    if (this._config.providers.some((entry) => entry.id === id)) {
      throw new Error(`Provider already configured: ${id}`);
    }

    this._config.providers.push({
      id,
      builtin: true,
      ...(apiKey !== undefined ? { apiKey } : {}),
    });

    this._models = null;
    this._saveConfig();
  }

  /**
   * Update a configured provider's fields. Only fields that are present are
   * touched: a `null` value clears that field (drops it from the entry), a
   * string sets it verbatim, and `undefined` leaves it unchanged. Throws when
   * the provider is not configured.
   */
  updateProvider(
    providerId: string,
    {
      apiKey,
      baseUrl,
    }: { apiKey?: string | null; baseUrl?: string | null }
  ): void {
    const entry = this._config.providers.find(
      (provider) => provider.id === providerId
    );
    if (!entry) {
      throw new Error(`Provider not configured: ${providerId}`);
    }
    if (apiKey !== undefined) {
      if (apiKey === null) delete entry.apiKey;
      else entry.apiKey = apiKey;
    }
    if (baseUrl !== undefined) {
      if (baseUrl === null) delete entry.baseUrl;
      else entry.baseUrl = baseUrl;
    }
    // Rebuild the registry so a cleared baseUrl restores the model's default
    // (the cached model instance would otherwise keep the mutated value).
    this._models = null;
    this._saveConfig();
  }

  /** The custom base URL override for a provider, if configured. */
  getBaseUrl(providerId: string): string | undefined {
    return this._config.providers.find((entry) => entry.id === providerId)
      ?.baseUrl;
  }

  /** The model ids the user has disabled for a provider (empty by default). */
  getDisabledModels(providerId: string): string[] {
    return (
      this._config.providers.find((entry) => entry.id === providerId)
        ?.disabledModels ?? []
    );
  }

  /**
   * Enable or disable a single model within a provider. Disabling records the
   * model id in the provider's `disabledModels`; enabling removes it. Model
   * enablement is a renderer-facing filter only — it does not affect the
   * `Models` registry — so the cached build is left intact. Throws when the
   * provider is not configured.
   */
  setModelEnabled(providerId: string, modelId: string, enabled: boolean): void {
    const entry = this._config.providers.find(
      (provider) => provider.id === providerId
    );
    if (!entry) {
      throw new Error(`Provider not configured: ${providerId}`);
    }
    const disabled = new Set(entry.disabledModels ?? []);
    if (enabled) {
      disabled.delete(modelId);
    } else {
      disabled.add(modelId);
    }
    if (disabled.size > 0) {
      entry.disabledModels = [...disabled];
    } else {
      delete entry.disabledModels;
    }
    this._saveConfig();
  }

  /**
   * Enable or disable every model of a provider at once. Enabling clears the
   * disabled list; disabling records the provider's full model-id list. We store
   * the explicit ids (rather than a `"*"` sentinel) so the existing blacklist
   * semantics stay intact — "disable all, then enable a few" is just removing
   * ids from the list — and so a later per-model toggle needs no special-casing.
   * A builtin provider's model set is static, so the stored list can't drift.
   */
  setAllModelsEnabled(providerId: string, enabled: boolean): void {
    const entry = this._config.providers.find(
      (provider) => provider.id === providerId
    );
    if (!entry) {
      throw new Error(`Provider not configured: ${providerId}`);
    }
    if (enabled) {
      delete entry.disabledModels;
    } else {
      const ids = this._providerModelIds(providerId);
      if (ids.length > 0) {
        entry.disabledModels = ids;
      }
    }
    this._saveConfig();
  }

  /** Remove a provider from `settings/models.json`. No-op when not configured. */
  removeProvider(providerId: string): void {
    const index = this._config.providers.findIndex(
      (entry) => entry.id === providerId
    );
    if (index === -1) {
      return;
    }
    this._config.providers.splice(index, 1);
    this._models = null;
    this._saveConfig();
  }

  /**
   * Resolve the configured API key for a provider. A value starting with `$` is
   * read from the matching environment variable (`$DEEPSEEK_API_KEY` →
   * `process.env.DEEPSEEK_API_KEY`); any other value is returned verbatim.
   * Returns `undefined` when the provider has no key configured.
   */
  async getApiKey(
    providerId: string,
    resolved = true
  ): Promise<string | undefined> {
    const apiKey = this._config.providers.find(
      (entry) => entry.id === providerId
    )?.apiKey;
    if (!resolved) {
      return apiKey;
    }
    if (!apiKey) {
      if (providerId === "openai-codex") {
        const codexApiKey = this._getCodexApiKey();
        if (codexApiKey) {
          return codexApiKey;
        }
      }
      return undefined;
    }
    if (apiKey.startsWith("$")) {
      return await Promise.resolve(process.env[apiKey.slice(1)]);
    }
    return apiKey;
  }

  /** The public homepage for a builtin provider, if known. */
  getWebsiteLink(providerId: string): string | undefined {
    return BUILTIN_PROVIDER_META[providerId]?.websiteLink;
  }

  /** Every model id a builtin provider exposes (empty for unknown providers). */
  private _providerModelIds(providerId: string): string[] {
    const provider = BUILTIN_PROVIDERS[providerId];
    return provider ? provider.getModels().map((model) => model.id) : [];
  }

  /** Assemble the configured providers into a `Models` registry. */
  private _buildModels(): Models {
    const models = createModels();
    for (const provider of this._buildProviders()) {
      models.setProvider(provider);
    }
    return models;
  }

  /**
   * Instantiate the builtin (`builtin: true`) providers named in the config,
   * deduped and sorted by id.
   */
  private _buildProviders(): Provider[] {
    const seen = new Set<string>();
    return this._config.providers
      .filter(
        (entry) => entry.builtin === true && entry.id in BUILTIN_PROVIDERS
      )
      .map((entry) => entry.id)
      .filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
      .sort((a, b) => a.localeCompare(b))
      .map((id) => BUILTIN_PROVIDERS[id]);
  }

  private get _configPath(): string {
    return path.join(getSettingsDir(), "models.json");
  }

  private _saveConfig(): void {
    mkdirSync(getSettingsDir(), { recursive: true });
    writeFileSync(
      this._configPath,
      `${JSON.stringify(this._config, null, 2)}\n`,
      "utf8"
    );
  }

  /**
   * Read `settings/models.json`. When the file does not exist yet, seed an empty
   * config on disk so the app has something to edit, and report no providers.
   */
  private _loadConfig(): ModelsConfig {
    try {
      const parsed = JSON.parse(
        readFileSync(this._configPath, "utf8")
      ) as ModelsConfig;
      return {
        providers: Array.isArray(parsed.providers) ? parsed.providers : [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      const empty: ModelsConfig = { providers: [] };
      mkdirSync(getSettingsDir(), { recursive: true });
      writeFileSync(
        this._configPath,
        `${JSON.stringify(empty, null, 2)}\n`,
        "utf8"
      );
      return empty;
    }
  }

  private async _detectProviders() {
    const potentialProviders: string[] = [];
    for (const provider of Object.values(BUILTIN_PROVIDERS)) {
      if (provider.id === "openai-codex") {
        if (this._getCodexApiKey()) {
          potentialProviders.push(provider.id);
        }
      } else {
        const res = await provider.auth.apiKey?.resolve({
          model: provider.getModels()[0],
          ctx: {
            env: (name) => Promise.resolve(env[name]),
            fileExists: (path) => Promise.resolve(existsSync(path)),
          },
        });
        if (res?.auth.apiKey) {
          potentialProviders.push(provider.id);
        }
      }
    }
    return potentialProviders;
  }

  private _getCodexApiKey(): string | undefined {
    const authPath = path.join(os.homedir(), ".codex", "auth.json");
    if (!existsSync(authPath)) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(readFileSync(authPath, "utf8")) as {
        tokens?: { access_token?: unknown };
      };
      const accessToken = parsed?.tokens?.access_token;
      return typeof accessToken === "string" ? accessToken : undefined;
    } catch {
      return undefined;
    }
  }
}

/** Process-wide singleton owning the models config. */
export const modelManager = new ModelManager();
