import { execFileSync } from "node:child_process";

/**
 * Read the operating-system display language (not the JS/ICU default, which is
 * often `en-US` regardless of the OS setting). Returns a lowercase locale tag
 * like `zh_cn` / `zh-hans`, or `""` when it can't be determined.
 */
export function getOsLocale() {
  try {
    if (process.platform === "darwin") {
      // AppleLocale reflects the Region/Language chosen in System Settings.
      return execFileSync("defaults", ["read", "-g", "AppleLocale"], {
        encoding: "utf8",
      })
        .trim()
        .toLowerCase();
    }
    if (process.platform === "win32") {
      return execFileSync(
        "powershell",
        ["-NoProfile", "-Command", "(Get-UICulture).Name"],
        { encoding: "utf8" }
      )
        .trim()
        .toLowerCase();
    }
    // Linux / other: fall back to the standard locale environment variables.
    return (
      process.env.LC_ALL ||
      process.env.LC_MESSAGES ||
      process.env.LANG ||
      ""
    ).toLowerCase();
  } catch {
    return "";
  }
}

let _currentLocale: string | null = null;

/** The effective locale — the OS display language until the user overrides it. */
function _effectiveLocale(): string {
  if (_currentLocale === null) _currentLocale = getOsLocale();
  return _currentLocale;
}

/** Override the process locale when the user switches the UI language. */
export function setAppLocale(lang: "en" | "zh") {
  _currentLocale = lang === "zh" ? "zh-cn" : "en";
}

/** Whether the effective UI locale is Chinese. */
export function isChineseLocale() {
  return _effectiveLocale().startsWith("zh");
}
