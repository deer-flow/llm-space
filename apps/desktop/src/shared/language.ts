/**
 * The languages the app UI ships in. English is the default and the source of
 * truth for the message tree; Chinese is the first translation. Kept in
 * `shared/` because both the renderer (React provider) and the bun main
 * process (native menu) need the same vocabulary.
 */
export type AppLanguage = "en" | "zh";

/** Native names, as shown in the Settings → General language picker. */
export const APP_LANGUAGES: readonly {
  code: AppLanguage;
  label: string;
}[] = [
  { code: "en", label: "English (US)" },
  { code: "zh", label: "中文" },
];

export function isAppLanguage(
  value: string | null | undefined
): value is AppLanguage {
  return value === "en" || value === "zh";
}

/**
 * Resolve the app language: an explicit past choice wins, otherwise any
 * preferred language that is a Chinese variant (`zh`, `zh-CN`, `zh-TW`, …)
 * picks Chinese, and everything else falls back to English.
 */
export function detectAppLanguage(
  stored: string | null | undefined,
  preferredLanguages: readonly (string | undefined)[] = []
): AppLanguage {
  if (isAppLanguage(stored)) {
    return stored;
  }
  const preferred = preferredLanguages.filter(
    (language): language is string => Boolean(language)
  );
  if (preferred.some((language) => language.toLowerCase().startsWith("zh"))) {
    return "zh";
  }
  return "en";
}
