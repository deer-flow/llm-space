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

/** Whether the OS display language is Chinese. */
export function isChineseLocale() {
  return getOsLocale().startsWith("zh");
}
