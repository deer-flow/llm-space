const APPEARANCE_PREFERENCE_KEYS = [
  "llm-space-theme",
  "llm-space-primary",
  "llm-space-rendering-fidelity",
] as const;

/**
 * Add pre-paint preferences only to ordinary HTTP(S) development URLs.
 *
 * Electrobun's CEF renderer does not recognize a `views://` URL carrying a
 * query string, so packaged view URLs must remain byte-for-byte unchanged.
 */
export function withAppearancePreferences(
  url: string,
  values: Record<string, string>
): string {
  const themedUrl = new URL(url);
  if (themedUrl.protocol === "views:") return url;

  for (const key of APPEARANCE_PREFERENCE_KEYS) {
    const value = values[key];
    if (value !== undefined) themedUrl.searchParams.set(key, value);
  }
  return themedUrl.toString();
}
