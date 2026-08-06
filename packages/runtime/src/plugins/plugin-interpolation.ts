import type { JsonObject, JsonValue } from "@llm-space/core";

const ENV_REF = /^\$([A-Za-z_][A-Za-z0-9_]*)$/;
const SETTINGS_REF = /\$\{settings\.([A-Za-z0-9_.-]+)\}/g;

export function interpolatePluginValue(
  value: JsonValue,
  settings: JsonObject
): JsonValue {
  if (typeof value === "string") {
    const envMatch = ENV_REF.exec(value);
    if (envMatch) return process.env[envMatch[1]] ?? "";
    return value.replace(SETTINGS_REF, (_match, key: string) => {
      const resolved = _get(settings, key);
      return resolved === undefined || resolved === null
        ? ""
        : typeof resolved === "string"
          ? resolved
          : JSON.stringify(resolved);
    });
  }
  if (Array.isArray(value)) {
    return value.map((item) => interpolatePluginValue(item, settings));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        interpolatePluginValue(child, settings),
      ])
    );
  }
  return value;
}

function _get(settings: JsonObject, key: string): JsonValue | undefined {
  let current: JsonValue = settings;
  for (const part of key.split(".")) {
    if (!current || Array.isArray(current) || typeof current !== "object") {
      return undefined;
    }
    current = current[part];
  }
  return current;
}
