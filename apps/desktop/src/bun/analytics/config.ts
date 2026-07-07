/**
 * Analytics configuration, resolved once from the environment.
 *
 * The PostHog project API key is a *write-only, client-side* key (safe to ship
 * in the app), but we still read it from the environment so forks and dev
 * builds can point at their own project — or disable telemetry entirely by
 * leaving it unset. `env/hydrate` runs before this is read, so a key exported
 * in the user's login shell is visible here.
 */

/** PostHog EU ingestion host (the user chose EU Cloud data residency). */
export const POSTHOG_HOST = "https://eu.i.posthog.com";

/**
 * The project API key. This is a *write-only, client-side* PostHog key — safe
 * to ship in the app. `LLM_SPACE_POSTHOG_KEY` repoints a fork or dev build at
 * its own project; to turn telemetry off, use `LLM_SPACE_ANALYTICS_DISABLED`
 * (below) rather than blanking the key.
 */
const DEFAULT_POSTHOG_KEY = "phc_t8sHZoJnt85kTQWtXjPmBHdha5sEvvcRFogKJiN9ihDY";

export const POSTHOG_KEY =
  process.env.LLM_SPACE_POSTHOG_KEY ?? DEFAULT_POSTHOG_KEY;

/**
 * Hard opt-out. Set `LLM_SPACE_ANALYTICS_DISABLED=1` (or `true`) to disable all
 * telemetry regardless of the key — honoured before any client is constructed.
 */
export const ANALYTICS_DISABLED = ["1", "true", "yes"].includes(
  (process.env.LLM_SPACE_ANALYTICS_DISABLED ?? "").toLowerCase()
);
