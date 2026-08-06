import type { PluginCommandView } from "@llm-space/core";

type CommandIdentity = Pick<PluginCommandView, "id" | "displayName">;

/** Parse a shell-like argument string with whitespace, quotes, and escapes. */
export function parsePluginCommandArguments(input: string): string[] {
  const args: string[] = [];
  let token = "";
  let tokenStarted = false;
  let quote: "'" | '"' | null = null;

  const push = () => {
    if (!tokenStarted) return;
    args.push(token);
    token = "";
    tokenStarted = false;
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === "\\" && quote !== "'") {
      const next = input[index + 1];
      if (next === undefined)
        throw new Error("Trailing escape in command arguments.");
      token += next;
      tokenStarted = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"') {
      if (quote === char) quote = null;
      else if (quote === null) quote = char;
      else token += char;
      tokenStarted = true;
      continue;
    }
    if (/\s/.test(char) && quote === null) {
      push();
      continue;
    }
    token += char;
    tokenStarted = true;
  }

  if (quote !== null)
    throw new Error(`Unclosed ${quote} quote in command arguments.`);
  push();
  return args;
}

/**
 * Return arguments when `input` starts with this command's display name or
 * stable file-stem alias; `null` means the input targets another command.
 */
export function parsePluginCommandInvocation(
  input: string,
  command: CommandIdentity
): string[] | null {
  const trimmed = input.trimStart();
  if (!trimmed) return [];
  const lower = trimmed.toLocaleLowerCase();
  for (const alias of _aliases(command)) {
    if (!lower.startsWith(alias.toLocaleLowerCase())) continue;
    const boundary = trimmed[alias.length];
    if (boundary !== undefined && !/\s/.test(boundary)) continue;
    return parsePluginCommandArguments(trimmed.slice(alias.length));
  }
  return null;
}

export function matchesCommandText(value: string, input: string): boolean {
  const words = input.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const haystack = value.toLocaleLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function pluginCommandQualifiedName(command: CommandIdentity): string {
  const pluginId =
    command.id.split(":command:")[0]?.replace(/^plugin:/, "") ?? command.id;
  return `${pluginId}/${_stem(command)}`;
}

function _aliases(command: CommandIdentity): string[] {
  const stem = _stem(command);
  return [...new Set([command.displayName.trim(), stem])]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
}

function _stem(command: CommandIdentity): string {
  return command.id.split(":command:").at(-1)?.trim() ?? "";
}
