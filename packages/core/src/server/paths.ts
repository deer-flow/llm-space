import os from "node:os";
import path from "node:path";

/** Root directory for llm-space user data (`settings/`, `workspace/`, etc.). */
export function getLlmSpaceHomePath(): string {
  return (
    process.env.LLM_SPACE_HOME ?? path.join(os.homedir(), ".llm-space")
  );
}

/** Directory holding persisted settings (`window.json`, etc.). */
export function getSettingsDir(): string {
  return path.join(getLlmSpaceHomePath(), "settings");
}

export function getWindowStatePath(): string {
  return path.join(getSettingsDir(), "window.json");
}
