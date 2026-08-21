import { en } from "./messages/index";
import { zh } from "./zh";

/** The languages the app ships in. English is the default. */
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "zh", label: "简体中文" },
] as const;

export type Lang = (typeof LANGUAGES)[number]["code"];

/** Whether a locale tag is any Chinese variant (zh, zh-CN, zh-TW, …). */
export function isZhLocale(locale: string): boolean {
  return locale.toLowerCase().startsWith("zh");
}

/** The shape of a single locale's message tree — en is the canonical schema. */
export type Messages = typeof en;

export const MESSAGES: { en: Messages; zh: Messages } = { en, zh };

/**
 * Replace `{key}` placeholders with `vars`. A placeholder missing from `vars`
 * stays literal (defensive — a typo'd key must not crash the UI); extra `vars`
 * are ignored.
 */
export function formatString(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match
  );
}

/**
 * Language resolution priority: an explicit stored choice wins; then the OS
 * display language; then the browser's preferred languages. `osLocale` is the
 * lowercase locale tag from the bun process (`getOsLocale`) or `""` when
 * unknown (web has no OS locale).
 */
export function resolveInitialLang(
  stored: string | null,
  osLocale: string,
  navigatorLanguages: string[]
): Lang {
  if (stored === "en" || stored === "zh") return stored;
  if (isZhLocale(osLocale)) return "zh";
  if (navigatorLanguages.some((l) => isZhLocale(l))) return "zh";
  return "en";
}

/** Map an app Lang to the timeago.js locale id. */
export function langToTimeago(lang: Lang): "en" | "zh_CN" {
  return lang === "zh" ? "zh_CN" : "en";
}
