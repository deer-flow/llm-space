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

import { BUILTIN_PROVIDERS } from "./providers/builtin-providers";
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
    }));
  }

  /**
   * Resolve the configured API key for a provider. A value starting with `$` is
   * read from the matching environment variable (`$DEEPSEEK_API_KEY` →
   * `process.env.DEEPSEEK_API_KEY`); any other value is returned verbatim.
   * Returns `undefined` when the provider has no key configured.
   */
  async getApiKey(providerId: string): Promise<string | undefined> {
    const apiKey = this._config.providers.find(
      (entry) => entry.id === providerId
    )?.apiKey;
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
