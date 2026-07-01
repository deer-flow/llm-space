/** One provider entry in `settings/models.json`. */
export interface ProviderConfig {
  id: string;
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
}

/** Shape of `settings/models.json`. */
export interface ModelsConfig {
  providers: ProviderConfig[];
}
