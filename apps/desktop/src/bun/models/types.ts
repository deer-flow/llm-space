import type { CustomModel } from "@llm-space/core";

/**
 * A user-defined model added to a provider in `settings/models.json`. The
 * manager fills in the `provider`/`baseUrl` from the owning provider at build
 * time. Aliased to the browser-safe {@link CustomModel} so the renderer, RPC,
 * and manager all agree on the shape.
 */
export type CustomModelConfig = CustomModel;

/** One provider entry in `settings/models.json`. */
export interface ProviderConfig {
  id: string;
  /** User-facing name for a custom provider. Builtins use the shipped name. */
  name?: string;
  /** Whether this is a builtin provider shipped with the app. */
  builtin?: boolean;
  apiKey?: string;
  /** Custom base URL override for this provider. Absent means the default. */
  baseUrl?: string;
  /**
   * Model ids the user has disabled for this provider. Absent/empty means every
   * model is enabled (the default).
   */
  disabledModels?: string[];
  /**
   * User-defined models added on top of a builtin provider's catalog. Their
   * `provider`/`baseUrl` are filled in from the owning provider at build time.
   */
  models?: CustomModelConfig[];
  /**
   * Ids of the user-added models (mirrors `models`). Kept as an explicit list
   * so these models can later be singled out for deletion.
   */
  customModels?: string[];
}

/** Shape of `settings/models.json`. */
export interface ModelsConfig {
  providers: ProviderConfig[];
}
