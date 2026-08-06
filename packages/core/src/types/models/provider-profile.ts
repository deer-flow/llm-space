/** A named set of connection settings for one model provider. */
export interface ProviderProfile {
  /** Stable local identity. Never persisted into a thread. */
  id: string;
  /** User-facing label, unique within the owning provider. */
  name: string;
  /** Literal API key or an environment-variable reference such as `$API_KEY`. */
  apiKey?: string;
  /** Custom endpoint override. Absent means the provider default. */
  baseUrl?: string;
  /** Extra HTTP headers merged into requests made with this profile. */
  headers?: Record<string, string>;
}

/** Mutable profile fields accepted across the runtime/RPC boundary. */
export interface ProviderProfilePatch {
  name?: string;
  apiKey?: string | null;
  baseUrl?: string | null;
  headers?: Record<string, string> | null;
}

/** Ephemeral reference to one provider connection. Never persisted in a thread. */
export interface ProviderConnectionRef {
  providerId: string;
  /** Omitted selects the provider's fixed first/default profile. */
  profileId?: string;
}

/** Show the fixed first profile as the default without duplicating its name. */
export function formatProviderProfileLabel(
  profile: ProviderProfile,
  index: number
): string {
  return index === 0 && profile.name.trim().toLocaleLowerCase() !== "default"
    ? `${profile.name} · Default`
    : profile.name;
}
