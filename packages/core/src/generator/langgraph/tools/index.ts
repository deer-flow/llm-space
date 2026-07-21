import {
  BUILTIN_TOOL_SOURCES,
  VARIABLES_PY_SOURCE,
} from "./built-in-sources.generated";

export { BUILTIN_TOOL_SOURCES, VARIABLES_PY_SOURCE };

/**
 * Built-in tools generated specially (not copied verbatim) because they need
 * the user's configuration baked in. `skill` embeds the configured skills.
 */
export const TEMPLATED_BUILTIN_TOOLS = new Set(["skill"]);

/**
 * Extra pip packages a built-in tool needs beyond the base scaffold. Only the
 * few tools that reach the network pull `requests`; the rest are stdlib (and
 * `grep` shells out to the system `rg`, which isn't a pip dependency).
 */
const BUILTIN_TOOL_PIP_DEPS: Record<string, string[]> = {
  web_search: ["requests"],
  web_fetch: ["requests"],
  weather_report: ["requests"],
};

/** Built-in tools whose presence means the project needs web-search config. */
export const WEB_TOOL_NAMES = ["web_search", "web_fetch"] as const;

/** Whether an embedded Python source exists for this built-in tool name. */
export function hasBuiltinToolSource(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILTIN_TOOL_SOURCES, name);
}

/** The embedded Python source for a built-in tool, or `undefined` if unknown. */
export function builtinToolSource(name: string): string | undefined {
  return BUILTIN_TOOL_SOURCES[name];
}

/** The union of extra pip deps needed by the given built-in tool names. */
export function builtinPipDeps(names: readonly string[]): string[] {
  const deps = new Set<string>();
  for (const name of names) {
    for (const dep of BUILTIN_TOOL_PIP_DEPS[name] ?? []) {
      deps.add(dep);
    }
  }
  return [...deps].sort();
}
