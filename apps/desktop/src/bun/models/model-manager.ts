import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { env } from "node:process";

import {
  createModels,
  type Api,
  type Model,
  type Models,
  type Provider,
} from "@earendil-works/pi-ai";
import { ModelProviderGroup, type ModelConfig } from "@llm-space/core";
import { getSettingsDir } from "@llm-space/core/server";

import {
  BUILTIN_PROVIDER_META,
  BUILTIN_PROVIDERS,
} from "./providers/builtin-providers";
import { createCustomProvider } from "./providers/custom-provider";
import {
  DEFAULT_CUSTOM_PROVIDER_API,
  type CustomModelConfig,
  type CustomProviderApi,
  type ModelsConfig,
  type ProviderConfig,
} from "./types";

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
    // Keep each provider's `customModels` in sync with its `models` list so the
    // renderer always sees which models are user-added, then persist any change.
    const providersChanged = this._normalizeCustomProviders();
    const modelsChanged = this._normalizeCustomModels();
    if (providersChanged || modelsChanged) {
      this._saveConfig();
    }
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

  /** Add a user-defined provider to `settings/models.json`. */
  addCustomProvider({
    id,
    name,
    baseUrl,
    api = DEFAULT_CUSTOM_PROVIDER_API,
  }: {
    id: string;
    name: string;
    baseUrl: string;
    api?: CustomProviderApi;
  }): void {
    if (this._config.providers.some((entry) => entry.id === id)) {
      throw new Error(`Provider already configured: ${id}`);
    }

    this._config.providers.push({ id, name, baseUrl, api });

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
      headers,
      name,
      api,
      icon,
    }: {
      apiKey?: string | null;
      baseUrl?: string | null;
      headers?: Record<string, string> | null;
      name?: string | null;
      api?: CustomProviderApi | null;
      icon?: string | null;
    }
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
    if (headers !== undefined) {
      if (headers === null || Object.keys(headers).length === 0) {
        delete entry.headers;
      } else {
        entry.headers = headers;
      }
    }
    if (name !== undefined) {
      if (name === null) delete entry.name;
      else entry.name = name;
    }
    if (api !== undefined) {
      if (api === null) delete entry.api;
      else entry.api = api;
    }
    if (icon !== undefined) {
      if (icon === null) delete entry.icon;
      else entry.icon = icon;
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

  /** The extra HTTP headers configured for a provider, if any. */
  getHeaders(providerId: string): Record<string, string> | undefined {
    return this._config.providers.find((entry) => entry.id === providerId)
      ?.headers;
  }

  /** The selected API compatibility mode for a custom provider. */
  getApi(providerId: string): CustomProviderApi | undefined {
    const entry = this._config.providers.find(
      (provider) => provider.id === providerId
    );
    if (!entry || entry.builtin === true) {
      return undefined;
    }
    return entry.api ?? DEFAULT_CUSTOM_PROVIDER_API;
  }

  /** The model ids the user has disabled for a provider (empty by default). */
  getDisabledModels(providerId: string): string[] {
    return (
      this._config.providers.find((entry) => entry.id === providerId)
        ?.disabledModels ?? []
    );
  }

  /**
   * The `@lobehub/icons` keyword overriding a provider's brand icon, if the user
   * set one. Absent ⇒ the renderer auto-resolves the icon from the provider
   * id/name.
   */
  getProviderIcon(providerId: string): string | undefined {
    return this._config.providers.find((entry) => entry.id === providerId)
      ?.icon;
  }

  /** The ids of the user-added models for a provider (empty by default). */
  getCustomModels(providerId: string): string[] {
    return (
      this._config.providers.find((entry) => entry.id === providerId)
        ?.customModels ?? []
    );
  }

  /** Whether a configured provider is one of the shipped builtin providers. */
  isBuiltin(providerId: string): boolean {
    return (
      this._config.providers.find((entry) => entry.id === providerId)
        ?.builtin === true
    );
  }

  /**
   * Whether a model id comes from a shipped builtin provider's static catalog,
   * as opposed to being typed in by the user (custom providers, and user-added
   * models on builtin providers). Only catalog ids are safe for telemetry to
   * record verbatim.
   */
  isBuiltinCatalogModel(providerId: string, modelId: string): boolean {
    if (!this.isBuiltin(providerId)) return false;
    const provider = BUILTIN_PROVIDERS[providerId];
    return provider
      ? provider.getModels().some((model) => model.id === modelId)
      : false;
  }

  /**
   * Enable or disable a single model within a provider. Disabling records the
   * model id in the provider's `disabledModels`; enabling removes it. Model
   * enablement is a renderer-facing filter only — it does not affect the
   * `Models` registry — so the cached build is left intact. Throws when the
   * provider is not configured.
   */
  /** The user's chosen default model, or `null` when set to automatic. */
  getDefaultModel(): ModelConfig | null {
    return this._config.defaultModel ?? null;
  }

  /**
   * Set (or clear, with `null`) the default model. Clearing means "automatic" —
   * threads fall back to the first available model.
   */
  setDefaultModel(model: ModelConfig | null): void {
    if (model) {
      this._config.defaultModel = model;
    } else {
      delete this._config.defaultModel;
    }
    this._saveConfig();
  }

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

  /**
   * Add or update a user-added custom model on a provider. When `originalId` is
   * given (an edit) the model it names is replaced — supporting a rename — and
   * any `disabledModels` reference is carried over to the new id. Stored without
   * `provider`/`baseUrl`; those are filled in at build time. Throws when the
   * provider is not configured.
   */
  upsertCustomModel(
    providerId: string,
    model: CustomModelConfig,
    originalId?: string
  ): void {
    const entry = this._config.providers.find(
      (provider) => provider.id === providerId
    );
    if (!entry) {
      throw new Error(`Provider not configured: ${providerId}`);
    }
    const removeId = originalId ?? model.id;
    const models = (entry.models ?? []).filter(
      (existing) => existing.id !== removeId
    );
    models.push(model);
    entry.models = models;
    entry.customModels = models.map((existing) => existing.id);
    if (originalId && originalId !== model.id && entry.disabledModels) {
      entry.disabledModels = entry.disabledModels.map((id) =>
        id === originalId ? model.id : id
      );
    }
    this._models = null;
    this._saveConfig();
  }

  /**
   * Remove a user-added custom model from a provider. Drops it from `models`,
   * `customModels`, and `disabledModels`, then rebuilds the registry so the
   * model disappears everywhere. Throws when the provider is not configured;
   * a no-op when the model is not a custom model of that provider.
   */
  removeCustomModel(providerId: string, modelId: string): void {
    const entry = this._config.providers.find(
      (provider) => provider.id === providerId
    );
    if (!entry) {
      throw new Error(`Provider not configured: ${providerId}`);
    }
    if (entry.models) {
      entry.models = entry.models.filter((model) => model.id !== modelId);
      if (entry.models.length === 0) delete entry.models;
    }
    if (entry.customModels) {
      entry.customModels = entry.customModels.filter((id) => id !== modelId);
      if (entry.customModels.length === 0) delete entry.customModels;
    }
    if (entry.disabledModels) {
      entry.disabledModels = entry.disabledModels.filter(
        (id) => id !== modelId
      );
      if (entry.disabledModels.length === 0) delete entry.disabledModels;
    }
    this._models = null;
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

  /**
   * Every model id a provider exposes: its builtin catalog plus any user-added
   * custom models (empty for unknown providers).
   */
  private _providerModelIds(providerId: string): string[] {
    const provider = BUILTIN_PROVIDERS[providerId];
    const builtin = provider
      ? provider.getModels().map((model) => model.id)
      : [];
    return [...builtin, ...this.getCustomModels(providerId)];
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
   * Instantiate the configured providers, deduped and sorted by id. Builtin
   * providers carrying user-added `models` are wrapped so their catalog includes
   * those custom models; custom providers are built from their saved metadata.
   */
  private _buildProviders(): Provider[] {
    const seen = new Set<string>();
    return this._config.providers
      .filter((entry) =>
        seen.has(entry.id) ? false : (seen.add(entry.id), true)
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((entry) => this._buildProvider(entry))
      .filter((provider): provider is Provider => provider !== null);
  }

  /**
   * The runtime provider for a config entry. Builtins use the shipped provider
   * and optionally append custom models; custom providers expose only their
   * user-defined models through the supported compatible APIs.
   */
  private _buildProvider(entry: ProviderConfig): Provider | null {
    const base = BUILTIN_PROVIDERS[entry.id];
    if (entry.builtin !== true) {
      return createCustomProvider({
        id: entry.id,
        name: entry.name ?? entry.id,
        baseUrl: entry.baseUrl ?? "",
        api: entry.api ?? DEFAULT_CUSTOM_PROVIDER_API,
        models: this._customModelsFor(entry),
      });
    }
    if (!base) {
      return null;
    }
    const custom = this._customModelsFor(entry);
    if (custom.length === 0) {
      return base;
    }
    const merged = [...base.getModels(), ...custom];
    return { ...base, getModels: () => merged };
  }

  /**
   * Resolve a provider's user-added models, filling in the `provider` id and a
   * `baseUrl` (defaulting to the builtin provider's base URL so the model reuses
   * the same endpoint that `getBaseUrl` overrides at runtime).
   */
  private _customModelsFor(entry: ProviderConfig): Model<Api>[] {
    const base = BUILTIN_PROVIDERS[entry.id];
    return (entry.models ?? []).map((model) => ({
      ...model,
      api:
        entry.builtin === true
          ? model.api
          : (entry.api ?? DEFAULT_CUSTOM_PROVIDER_API),
      provider: entry.id,
      baseUrl: model.baseUrl ?? base?.baseUrl ?? entry.baseUrl ?? "",
    }));
  }

  /**
   * Ensure every provider's `customModels` mirrors the ids in its `models`
   * list. Returns whether anything changed so the caller can persist.
   */
  private _normalizeCustomModels(): boolean {
    let changed = false;
    for (const entry of this._config.providers) {
      if (!entry.models || entry.models.length === 0) {
        continue;
      }
      const ids = entry.models.map((model) => model.id);
      const current = entry.customModels ?? [];
      const same =
        ids.length === current.length &&
        ids.every((id, index) => id === current[index]);
      if (!same) {
        entry.customModels = ids;
        changed = true;
      }
    }
    return changed;
  }

  /**
   * Ensure custom providers have an explicit API mode on disk. Older custom
   * provider entries did not store this field, but the settings UI should not
   * show a value that is only implicit.
   */
  private _normalizeCustomProviders(): boolean {
    let changed = false;
    for (const entry of this._config.providers) {
      if (entry.builtin === true) {
        continue;
      }
      if (!entry.api) {
        entry.api = DEFAULT_CUSTOM_PROVIDER_API;
        changed = true;
      }
    }
    return changed;
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
        defaultModel: parsed.defaultModel,
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
