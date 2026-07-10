import os from "node:os";
import path from "node:path";

/**
 * Root directory for llm-space user data (`settings/`, `workspace/`, etc.).
 * `LLM_SPACE_HOME` overrides everything. Otherwise: `~/.llm-space` on
 * macOS/Linux, and the conventional `%APPDATA%\llm-space` on Windows (a
 * dot-folder in the user profile is alien there).
 */
export function getLlmSpaceHomePath(): string {
  if (process.env.LLM_SPACE_HOME) {
    return process.env.LLM_SPACE_HOME;
  }
  if (process.platform === "win32") {
    const appData =
      process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "llm-space");
  }
  return path.join(os.homedir(), ".llm-space");
}

/** Directory holding persisted settings (`window.json`, etc.). */
export function getSettingsDir(): string {
  return path.join(getLlmSpaceHomePath(), "settings");
}

export function getWindowStatePath(): string {
  return path.join(getSettingsDir(), "window.json");
}
