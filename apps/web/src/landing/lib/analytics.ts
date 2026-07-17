// Thin, type-safe wrapper over the PostHog browser snippet loaded in index.html.
// The snippet assigns `window.posthog`; this helper no-ops gracefully if the
// script was blocked (ad blockers, offline) so callers never need to guard.

type PostHogLike = {
  capture: (event: string, properties?: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    posthog?: PostHogLike;
  }
}

/** Fire a named analytics event. Safe to call before/without PostHog loaded. */
export function capture(
  event: string,
  properties?: Record<string, unknown>
): void {
  window.posthog?.capture(event, properties);
}
