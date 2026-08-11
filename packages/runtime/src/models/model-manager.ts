import { existsSync } from "node:fs";
import path from "node:path";
import { env } from "node:process";

import {
  createModels,
  type Api,
  type Model,
  type Models,
  type Provider,
} from "@earendil-works/pi-ai";
import {
  DEFAULT_ARK_IMAGE_GENERATION_CONFIG,
  getArkImageModelDefinitions,
  ModelConfig,
  SEEDREAM_IMAGE_MODELS,
  SEEDREAM_IMAGE_SIZES,
  type ArkImageGenerationConfig,
  type CustomModel,
  type ModelProviderGroup,
  type ProviderConnectionRef,
  type ProviderProfile,
  type ProviderProfilePatch,
  type SeedreamImageModelDefinition,
  type SeedreamImageSize,
  uuid,
} from "@llm-space/core";
import {
  atomicWriteJsonFileSync,
  getSettingsDir,
  readJsonFileSync,
} from "@llm-space/core/server";
import { z } from "zod";

import {
  BUILTIN_PROVIDER_META,
  BUILTIN_PROVIDERS,
} from "./providers/builtin-providers";
import { createCustomProvider } from "./providers/custom-provider";
import { getCodexCredentials } from "./providers/openai-codex";
import {
  DEFAULT_CUSTOM_PROVIDER_API,
  type CustomModelConfig,
  type CustomProviderApi,
  type ModelsConfig,
  type ProviderConfig,
  type ProviderProfileConfig,
} from "./types";

const CustomModelFileSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  api: z.enum(["anthropic-messages", "openai-completions", "openai-responses"]),
  provider: z.string().optional(),
  baseUrl: z.string().optional(),
  icon: z.string().optional(),
  reasoning: z.boolean(),
  input: z.array(z.enum(["text", "image"])),
  cost: z.object({
    input: z.number(),
    output: z.number(),
    cacheRead: z.number(),
    cacheWrite: z.number(),
    tiers: z
      .array(
        z.object({
          input: z.number(),
          output: z.number(),
          cacheRead: z.number(),
          cacheWrite: z.number(),
          inputTokensAbove: z.number(),
        })
      )
      .optional(),
  }),
  contextWindow: z.number().positive(),
  maxTokens: z.number().positive(),
  headers: z.record(z.string(), z.string()).optional(),
}) as unknown as z.ZodType<CustomModel>;
const ModelConfigFileSchema = z.fromJSONSchema(
  ModelConfig as unknown as Parameters<typeof z.fromJSONSchema>[0]
);
const PROVIDER_PROFILE_FILE_SCHEMA = z.object({
  id: z.string(),
  name: z.string(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});
const ARK_IMAGE_MODEL_FILE_SCHEMA = z.object({
  id: z.string(),
  name: z.string(),
  supportedSizes: z.array(z.enum(SEEDREAM_IMAGE_SIZES)),
  defaultSize: z.enum(SEEDREAM_IMAGE_SIZES),
  icon: z.string().optional(),
});
const ARK_IMAGE_GENERATION_FILE_SCHEMA = z.object({
  models: z.array(ARK_IMAGE_MODEL_FILE_SCHEMA).optional(),
  disabledModels: z.array(z.string()).optional(),
});
const ProviderConfigFileSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  builtin: z.boolean().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  profiles: z.array(PROVIDER_PROFILE_FILE_SCHEMA).optional(),
  api: z
    .enum(["anthropic-messages", "openai-completions", "openai-responses"])
    .optional(),
  icon: z.string().optional(),
  disabledModels: z.array(z.string()).optional(),
  models: z.array(CustomModelFileSchema).optional(),
  customModels: z.array(z.string()).optional(),
  imageGeneration: ARK_IMAGE_GENERATION_FILE_SCHEMA.optional(),
});
const ModelsConfigFileSchema = z.object({
  providers: z.array(ProviderConfigFileSchema),
  defaultModel: ModelConfigFileSchema.optional(),
});

export interface ResolvedProviderConnection {
  apiKey?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
}

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
  private readonly _settingsDir: string;
  private readonly _config: ModelsConfig;
  private _pluginProviders: {
    pluginId: string;
    provider: ProviderConfig;
  }[] = [];
  private _models: Models | null = null;

  /** Load model settings from the normal app directory or an isolated test root. */
  constructor(options: { settingsDir?: string } = {}) {
    this._settingsDir = options.settingsDir ?? getSettingsDir();
    this._config = this._loadConfig();
    // Keep each provider's `customModels` in sync with its `models` list so the
    // renderer always sees which models are user-added, then persist any change.
    const providersChanged = this._normalizeCustomProviders();
    const modelsChanged = this._normalizeCustomModels();
    const imageGenerationChanged = this._normalizeArkImageGeneration();
    const profilesChanged = this._normalizeProviderProfiles();
    if (
      providersChanged ||
      modelsChanged ||
      imageGenerationChanged ||
      profilesChanged
    ) {
      this._saveConfig();
    }
  }

  /** The `Models` registry of configured providers. Built once, then cached. */
  async getAvailableModels(): Promise<Models> {
    return (this._models ??= await Promise.resolve(this._buildModels()));
  }

  setPluginProviders(
    entries: { pluginId: string; provider: ProviderConfig }[]
  ): void {
    const userIds = new Set(this._config.providers.map((entry) => entry.id));
    const counts = new Map<string, number>();
    for (const entry of entries) {
      counts.set(entry.provider.id, (counts.get(entry.provider.id) ?? 0) + 1);
    }
    this._pluginProviders = entries.filter(
      (entry) =>
        !userIds.has(entry.provider.id) && counts.get(entry.provider.id) === 1
    );
    this._models = null;
  }

  getProviderSource(providerId: string): {
    source: "user" | "plugin";
    readOnly: boolean;
    pluginId?: string;
  } {
    const plugin = this._pluginProviders.find(
      (entry) => entry.provider.id === providerId
    );
    return plugin
      ? { source: "plugin", readOnly: true, pluginId: plugin.pluginId }
      : { source: "user", readOnly: false };
  }

  /**
   * Build a one-off `Models` registry that includes an unsaved `candidate`
   * custom model merged into `providerId` (overriding any saved model with the
   * same id). Used to test a model's connection from the editor dialog before it
   * is persisted — for both new models and edited-but-unsaved config. The
   * candidate is resolved through the same path as saved custom models so it
   * reuses the provider's api/baseUrl. Never touches the cached registry.
   */
  buildModelsWithCandidate(providerId: string, candidate: CustomModel): Models {
    const entry = this._config.providers.find(
      (provider) => provider.id === providerId
    );
    if (!entry) {
      throw new Error(`Provider not configured: ${providerId}`);
    }
    // Rebuild the target provider from a synthetic config entry that merges the
    // candidate into its saved models (overriding any with the same id). For
    // custom providers the candidate's chosen API mode is honored too, since a
    // custom provider picks its API implementation from the provider-level
    // `api` — so a changed "API type" is what actually gets tested.
    const others = (entry.models ?? []).filter(
      (model) => model.id !== candidate.id
    );
    const syntheticEntry: ProviderConfig = {
      ...entry,
      ...(entry.builtin === true
        ? {}
        : { api: candidate.api as CustomProviderApi }),
      models: [...others, candidate],
    };
    const target = this._buildProvider(syntheticEntry);
    if (!target) {
      throw new Error(`Provider not configured: ${providerId}`);
    }
    const models = createModels();
    for (const provider of this._buildProviders()) {
      if (provider.id !== providerId) {
        models.setProvider(provider);
      }
    }
    models.setProvider(target);
    return models;
  }

  async getBuiltinProviders(): Promise<ModelProviderGroup[]> {
    const detected = await this._detectProviders();
    return Object.values(BUILTIN_PROVIDERS).map((provider) => ({
      id: provider.id,
      name: provider.name,
      models: [],
      profiles: [],
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
      ...(id === "ark"
        ? { imageGeneration: { ...DEFAULT_ARK_IMAGE_GENERATION_CONFIG } }
        : {}),
      profiles: [
        {
          id: uuid(),
          name: "Default",
          ...(apiKey !== undefined ? { apiKey } : {}),
        },
      ],
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

    this._config.providers.push({
      id,
      name,
      api,
      profiles: [
        {
          id: uuid(),
          name: "Default",
          ...(baseUrl ? { baseUrl } : {}),
        },
      ],
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
      name,
      api,
      icon,
      imageGeneration,
    }: {
      name?: string | null;
      api?: CustomProviderApi | null;
      icon?: string | null;
      imageGeneration?: ArkImageGenerationConfig;
    }
  ): void {
    const entry = this._config.providers.find(
      (provider) => provider.id === providerId
    );
    if (!entry) {
      throw new Error(`Provider not configured: ${providerId}`);
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
    if (imageGeneration !== undefined) {
      if (providerId !== "ark" || entry.builtin !== true) {
        throw new Error(
          "Image generation can only be configured on the builtin Ark provider."
        );
      }
      _assertArkImageGenerationConfig(imageGeneration);
      entry.imageGeneration = { ...imageGeneration };
    }
    // Rebuild the registry so a cleared baseUrl restores the model's default
    // (the cached model instance would otherwise keep the mutated value).
    this._models = null;
    this._saveConfig();
  }

  /** Add a custom connection profile, cloning the default endpoint and headers. */
  addProfile(providerId: string): string {
    const entry = this._providerEntry(providerId);
    const profiles = this._profilesFor(entry);
    const first = profiles[0];
    const id = uuid();
    profiles.push({
      id,
      name: this._nextProfileName(profiles),
      ...(first.baseUrl ? { baseUrl: first.baseUrl } : {}),
      ...(first.headers ? { headers: { ...first.headers } } : {}),
    });
    this._saveConfig();
    return id;
  }

  /** Update one profile without changing its stable identity or position. */
  updateProfile(
    providerId: string,
    profileId: string,
    fields: ProviderProfilePatch
  ): void {
    const entry = this._providerEntry(providerId);
    const profiles = this._profilesFor(entry);
    const profile = profiles.find((candidate) => candidate.id === profileId);
    if (!profile) {
      throw new Error(
        `Provider profile not configured: ${providerId}/${profileId}`
      );
    }
    const profileIndex = profiles.findIndex(
      (candidate) => candidate.id === profileId
    );
    if (
      entry.builtin === true &&
      profileIndex === 0 &&
      (fields.baseUrl !== undefined || fields.headers !== undefined)
    ) {
      throw new Error(
        "The official provider profile only supports an API key. Use a custom profile for base URLs or headers."
      );
    }
    if (fields.name !== undefined) {
      const name = fields.name.trim();
      if (!name) {
        throw new Error("Profile name is required.");
      }
      const duplicate = profiles.some(
        (candidate) =>
          candidate.id !== profileId &&
          candidate.name.toLocaleLowerCase() === name.toLocaleLowerCase()
      );
      if (duplicate) {
        throw new Error(`Profile name already exists: ${name}`);
      }
      profile.name = name;
    }
    if (fields.apiKey !== undefined) {
      if (fields.apiKey === null) delete profile.apiKey;
      else profile.apiKey = fields.apiKey;
    }
    if (fields.baseUrl !== undefined) {
      if (fields.baseUrl === null) delete profile.baseUrl;
      else profile.baseUrl = fields.baseUrl;
    }
    if (fields.headers !== undefined) {
      if (fields.headers === null || Object.keys(fields.headers).length === 0) {
        delete profile.headers;
      } else {
        profile.headers = { ...fields.headers };
      }
    }
    this._models = null;
    this._saveConfig();
  }

  /** Remove a non-default profile. The first profile is intentionally fixed. */
  removeProfile(providerId: string, profileId: string): void {
    const entry = this._providerEntry(providerId);
    const profiles = this._profilesFor(entry);
    const index = profiles.findIndex((profile) => profile.id === profileId);
    if (index === -1) {
      throw new Error(
        `Provider profile not configured: ${providerId}/${profileId}`
      );
    }
    if (index === 0) {
      throw new Error("The default provider profile cannot be removed.");
    }
    profiles.splice(index, 1);
    this._saveConfig();
  }

  /** Renderer-safe copies of a provider's profiles in creation order. */
  getProfiles(providerId: string): ProviderProfile[] {
    const entry = this._findProvider(providerId);
    if (!entry) {
      throw new Error(`Provider not configured: ${providerId}`);
    }
    return this._profilesFor(entry).map((profile) => ({
      ...profile,
      ...(profile.headers ? { headers: { ...profile.headers } } : {}),
    }));
  }

  /** Resolve one immutable connection snapshot for a model or tool invocation. */
  async resolveConnection(
    connection: ProviderConnectionRef,
    options: { fallbackApiKey?: string } = {}
  ): Promise<ResolvedProviderConnection> {
    const { providerId, profileId } = connection;
    const configuredApiKey = await this.getApiKey(providerId, false, profileId);
    const apiKey =
      configuredApiKey === undefined
        ? options.fallbackApiKey
        : await this.getApiKey(providerId, true, profileId);
    return {
      apiKey,
      baseUrl: this.getBaseUrl(providerId, profileId),
      headers: this.getHeaders(providerId, profileId),
    };
  }

  /** The custom base URL override for a provider, if configured. */
  getBaseUrl(providerId: string, profileId?: string): string | undefined {
    return this._profileFor(providerId, profileId).baseUrl;
  }

  /** The extra HTTP headers configured for a provider, if any. */
  getHeaders(
    providerId: string,
    profileId?: string
  ): Record<string, string> | undefined {
    const headers = this._profileFor(providerId, profileId).headers;
    return headers ? { ...headers } : undefined;
  }

  /** The selected API compatibility mode for a custom provider. */
  getApi(providerId: string): CustomProviderApi | undefined {
    const entry = this._findProvider(providerId);
    if (!entry || entry.builtin === true) {
      return undefined;
    }
    return entry.api ?? DEFAULT_CUSTOM_PROVIDER_API;
  }

  /** The model ids the user has disabled for a provider (empty by default). */
  getDisabledModels(providerId: string): string[] {
    return this._findProvider(providerId)?.disabledModels ?? [];
  }

  /**
   * The `@lobehub/icons` keyword overriding a provider's brand icon, if the user
   * set one. Absent ⇒ the renderer auto-resolves the icon from the provider
   * id/name.
   */
  getProviderIcon(providerId: string): string | undefined {
    return this._findProvider(providerId)?.icon;
  }

  /** The saved Ark image-model inventory, or undefined without Ark. */
  getArkImageGenerationConfig(): ArkImageGenerationConfig | undefined {
    const config = this._config.providers.find(
      (entry) => entry.id === "ark" && entry.builtin === true
    )?.imageGeneration;
    return config ? { ...config } : undefined;
  }

  /** The ids of the user-added models for a provider (empty by default). */
  getCustomModels(providerId: string): string[] {
    return this._findProvider(providerId)?.customModels ?? [];
  }

  /** Whether a configured provider is one of the shipped builtin providers. */
  isBuiltin(providerId: string): boolean {
    return this._findProvider(providerId)?.builtin === true;
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
    resolved = true,
    profileId?: string
  ): Promise<string | undefined> {
    const apiKey = this._profileFor(providerId, profileId).apiKey;
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
    return this._effectiveProviders()
      .filter((entry) =>
        seen.has(entry.id) ? false : (seen.add(entry.id), true)
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((entry) => this._buildProvider(entry))
      .filter((provider): provider is Provider => provider !== null);
  }

  private _findProvider(providerId: string): ProviderConfig | undefined {
    return this._effectiveProviders().find((entry) => entry.id === providerId);
  }

  private _effectiveProviders(): ProviderConfig[] {
    return [
      ...this._config.providers,
      ...this._pluginProviders.map((entry) => entry.provider),
    ];
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
        baseUrl: this._profilesFor(entry)[0]?.baseUrl ?? "",
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
    const defaultBaseUrl = this._profilesFor(entry)[0]?.baseUrl;
    return (entry.models ?? []).map((model) => ({
      ...model,
      api:
        entry.builtin === true
          ? model.api
          : (entry.api ?? DEFAULT_CUSTOM_PROVIDER_API),
      provider: entry.id,
      baseUrl: model.baseUrl ?? base?.baseUrl ?? defaultBaseUrl ?? "",
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

  /**
   * Normalize Ark's image-model inventory and remove legacy provider defaults.
   * This keeps upgrades readable without treating image models as chat models
   * or rejecting the whole settings file.
   */
  private _normalizeArkImageGeneration(): boolean {
    const entry = this._config.providers.find(
      (provider) => provider.id === "ark" && provider.builtin === true
    );
    if (!entry) {
      return false;
    }
    const normalized = _normalizeArkImageGenerationConfig(
      entry.imageGeneration
    );
    if (JSON.stringify(entry.imageGeneration) === JSON.stringify(normalized)) {
      return false;
    }
    entry.imageGeneration = normalized;
    return true;
  }

  /**
   * Migrate legacy connection fields into profiles and keep builtin defaults
   * pinned to their official service. Older configs could put a custom URL or
   * headers on that default; preserve those credentials in a custom profile.
   */
  private _normalizeProviderProfiles(): boolean {
    let changed = false;
    for (const entry of this._config.providers) {
      if (!entry.profiles || entry.profiles.length === 0) {
        entry.profiles = [{ id: uuid(), name: "Default" }];
        changed = true;
      }
      const first = entry.profiles[0];
      if (entry.apiKey !== undefined) {
        first.apiKey = entry.apiKey;
        delete entry.apiKey;
        changed = true;
      }
      if (entry.baseUrl !== undefined) {
        first.baseUrl = entry.baseUrl;
        delete entry.baseUrl;
        changed = true;
      }
      if (entry.headers !== undefined) {
        first.headers = { ...entry.headers };
        delete entry.headers;
        changed = true;
      }
      if (
        entry.builtin === true &&
        (first.baseUrl !== undefined || first.headers !== undefined)
      ) {
        entry.profiles.splice(1, 0, {
          id: uuid(),
          name: this._nextProfileName(entry.profiles),
          ...(first.apiKey !== undefined ? { apiKey: first.apiKey } : {}),
          ...(first.baseUrl !== undefined ? { baseUrl: first.baseUrl } : {}),
          ...(first.headers !== undefined
            ? { headers: { ...first.headers } }
            : {}),
        });
        delete first.apiKey;
        delete first.baseUrl;
        delete first.headers;
        changed = true;
      }
    }
    return changed;
  }

  private _providerEntry(providerId: string): ProviderConfig {
    const entry = this._config.providers.find(
      (provider) => provider.id === providerId
    );
    if (!entry) {
      throw new Error(`Provider not configured: ${providerId}`);
    }
    return entry;
  }

  private _profilesFor(entry: ProviderConfig): ProviderProfileConfig[] {
    return (entry.profiles ??= [
      {
        id: uuid(),
        name: "Default",
        ...(entry.apiKey !== undefined ? { apiKey: entry.apiKey } : {}),
        ...(entry.baseUrl !== undefined ? { baseUrl: entry.baseUrl } : {}),
        ...(entry.headers !== undefined
          ? { headers: { ...entry.headers } }
          : {}),
      },
    ]);
  }

  private _profileFor(
    providerId: string,
    profileId?: string
  ): ProviderProfileConfig {
    const entry = this._findProvider(providerId);
    if (!entry) {
      throw new Error(`Provider not configured: ${providerId}`);
    }
    const profiles = this._profilesFor(entry);
    const profile = profileId
      ? profiles.find((candidate) => candidate.id === profileId)
      : profiles[0];
    if (!profile) {
      throw new Error(
        `Provider profile not configured: ${providerId}/${profileId}`
      );
    }
    return profile;
  }

  private _nextProfileName(profiles: ProviderProfileConfig[]): string {
    const names = new Set(
      profiles.map((profile) => profile.name.toLocaleLowerCase())
    );
    let index = 1;
    while (names.has(`custom profile ${index}`)) {
      index += 1;
    }
    return `Custom profile ${index}`;
  }

  private get _configPath(): string {
    return path.join(this._settingsDir, "models.json");
  }

  private _saveConfig(): void {
    atomicWriteJsonFileSync(this._configPath, this._config);
  }

  /**
   * Read `settings/models.json`. When the file does not exist yet, seed an empty
   * config on disk so the app has something to edit, and report no providers.
   */
  private _loadConfig(): ModelsConfig {
    return readJsonFileSync(this._configPath, {
      schema: ModelsConfigFileSchema as z.ZodType<ModelsConfig>,
      recovery: "best-effort",
      fallback: (): ModelsConfig => ({ providers: [] }),
      seedMissing: true,
    }).value;
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
          ctx: {
            env: (name) => Promise.resolve(env[name]),
            fileExists: (path) => Promise.resolve(existsSync(path)),
          },
          signal: new AbortController().signal,
        });
        if (res?.auth.apiKey) {
          potentialProviders.push(provider.id);
        }
      }
    }
    return potentialProviders;
  }

  private _getCodexApiKey(): string | undefined {
    return getCodexCredentials()?.apiKey;
  }
}

/** Validate a renderer-supplied Ark image configuration before persisting it. */
function _assertArkImageGenerationConfig(
  config: ArkImageGenerationConfig
): void {
  _assertCustomArkImageModels(config.models);
  const models = getArkImageModelDefinitions(config);
  const modelIds = new Set(models.map((model) => model.id));
  const disabledModels = config.disabledModels ?? [];
  if (
    disabledModels.some((modelId) => !modelIds.has(modelId)) ||
    new Set(disabledModels).size !== disabledModels.length
  ) {
    throw new Error(
      "Disabled Ark image models must reference unique model ids."
    );
  }
}

/** Normalize untrusted JSON from older or manually edited settings files. */
function _normalizeArkImageGenerationConfig(
  value: unknown
): ArkImageGenerationConfig {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<ArkImageGenerationConfig>)
      : {};
  const models = _normalizeCustomArkImageModels(candidate.models);
  const withModels: ArkImageGenerationConfig = {
    ...(models.length > 0 ? { models } : {}),
  };
  const modelIds = new Set(
    getArkImageModelDefinitions(withModels).map((model) => model.id)
  );
  const disabledModels = Array.isArray(candidate.disabledModels)
    ? [
        ...new Set(
          candidate.disabledModels.filter(
            (modelId): modelId is string =>
              typeof modelId === "string" && modelIds.has(modelId)
          )
        ),
      ]
    : [];
  return {
    ...(models.length > 0 ? { models } : {}),
    ...(disabledModels.length > 0 ? { disabledModels } : {}),
  };
}

/** Reject invalid custom model definitions supplied through renderer RPC. */
function _assertCustomArkImageModels(
  models: ArkImageGenerationConfig["models"]
): void {
  if (models === undefined) {
    return;
  }
  if (!Array.isArray(models)) {
    throw new Error("Custom Ark image models must be an array.");
  }
  const seen = new Set<string>(SEEDREAM_IMAGE_MODELS.map((model) => model.id));
  for (const model of models) {
    if (
      !model ||
      typeof model.id !== "string" ||
      model.id.trim() !== model.id ||
      model.id === "" ||
      typeof model.name !== "string" ||
      model.name.trim() !== model.name ||
      model.name === ""
    ) {
      throw new Error("Custom Ark image models require a valid id and name.");
    }
    if (seen.has(model.id)) {
      throw new Error(`Duplicate Ark image model id: ${model.id}`);
    }
    seen.add(model.id);
    const sizes = model.supportedSizes;
    if (
      !Array.isArray(sizes) ||
      sizes.length === 0 ||
      sizes.some((size) => !_isSeedreamImageSize(size)) ||
      new Set(sizes).size !== sizes.length ||
      !sizes.includes(model.defaultSize)
    ) {
      throw new Error(
        `Custom Ark image model ${model.id} has invalid size presets.`
      );
    }
    if (model.icon !== undefined && typeof model.icon !== "string") {
      throw new Error(
        `Custom Ark image model ${model.id} has an invalid icon.`
      );
    }
  }
}

/** Repair user-edited JSON by keeping only complete, unique custom models. */
function _normalizeCustomArkImageModels(
  value: unknown
): SeedreamImageModelDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>(SEEDREAM_IMAGE_MODELS.map((model) => model.id));
  const models: SeedreamImageModelDefinition[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const candidate = raw as Partial<SeedreamImageModelDefinition>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const name =
      typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!id || !name || seen.has(id)) {
      continue;
    }
    const supportedSizes = Array.isArray(candidate.supportedSizes)
      ? [...new Set(candidate.supportedSizes.filter(_isSeedreamImageSize))]
      : [];
    if (supportedSizes.length === 0) {
      continue;
    }
    const defaultSize =
      _isSeedreamImageSize(candidate.defaultSize) &&
      supportedSizes.includes(candidate.defaultSize)
        ? candidate.defaultSize
        : supportedSizes[0];
    const icon =
      typeof candidate.icon === "string" && candidate.icon.trim()
        ? candidate.icon.trim()
        : undefined;
    seen.add(id);
    models.push({
      id,
      name,
      supportedSizes,
      defaultSize,
      ...(icon ? { icon } : {}),
    });
  }
  return models;
}

/** Narrow unknown persisted values to Ark's supported size presets. */
function _isSeedreamImageSize(value: unknown): value is SeedreamImageSize {
  return (
    typeof value === "string" &&
    (SEEDREAM_IMAGE_SIZES as readonly string[]).includes(value)
  );
}
