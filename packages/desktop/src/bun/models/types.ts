/** One provider entry in `settings/models.json`. */
export interface ProviderConfig {
  id: string;
  /** Whether this is a builtin provider shipped with the app. */
  builtin?: boolean;
  apiKey?: string;
}

/** Shape of `settings/models.json`. */
export interface ModelsConfig {
  providers: ProviderConfig[];
}
