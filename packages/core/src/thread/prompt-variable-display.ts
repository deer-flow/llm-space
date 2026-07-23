import type { ThreadContext, ThreadSkillsVariable } from "../types";

import {
  DEFAULT_VARIABLE_VARIANT_NAME,
  formatCurrentDateVariable,
  formatJsonVariable,
  formatSkillsVariable,
  includesAllSkills,
  normalizePromptVariableState,
  VARIABLE_NAME_RE,
  type PromptSkill,
} from "./prompt-variables";

export interface PromptVariableCompletion {
  name: string;
  hint: string;
}

export type VariableResolution =
  | { status: "ok"; value: string }
  | { status: "empty"; name: string }
  | { status: "unknown"; name: string }
  | { status: "invalid"; name: string };

export function resolvePromptVariableValueSync(
  name: string,
  context: ThreadContext | undefined
):
  | VariableResolution
  | { status: "needsSkills"; variable: ThreadSkillsVariable } {
  if (!VARIABLE_NAME_RE.test(name)) {
    return { status: "invalid", name };
  }
  const state = normalizePromptVariableState(context);
  const builtIn = state.variables[name];
  if (builtIn?.type === "currentDate") {
    return { status: "ok", value: formatCurrentDateVariable(builtIn.format) };
  }
  if (builtIn?.type === "workingDirectory") {
    return builtIn.value.trim()
      ? { status: "ok", value: builtIn.value }
      : { status: "empty", name };
  }
  if (builtIn?.type === "skills") {
    return { status: "needsSkills", variable: builtIn };
  }
  if (builtIn?.type === "json") {
    const value = formatJsonVariable(builtIn.value);
    return value === undefined
      ? { status: "empty", name }
      : { status: "ok", value };
  }
  if (builtIn?.type === "file") {
    // Display the path (reading the file's contents is async / run-time only).
    const path = builtIn.value.trim();
    return path ? { status: "ok", value: path } : { status: "empty", name };
  }
  const customValues =
    state.variableVariants.variants[DEFAULT_VARIABLE_VARIANT_NAME] ?? {};
  if (!(name in customValues)) {
    return { status: "unknown", name };
  }
  const raw = customValues[name];
  return raw?.trim() ? { status: "ok", value: raw } : { status: "empty", name };
}

export async function resolvePromptVariableValue(
  name: string,
  context: ThreadContext | undefined,
  loadSkills: () => Promise<PromptSkill[]>
): Promise<VariableResolution> {
  const fast = resolvePromptVariableValueSync(name, context);
  if (fast.status !== "needsSkills") {
    return fast;
  }
  try {
    const all = await loadSkills();
    const byName = new Map(all.map((skill) => [skill.name, skill]));
    const selected = includesAllSkills(fast.variable)
      ? all
      : fast.variable.skillNames.flatMap((skillName) => {
          const skill = byName.get(skillName);
          return skill ? [skill] : [];
        });
    const value = formatSkillsVariable(selected, fast.variable);
    return value.trim() ? { status: "ok", value } : { status: "empty", name };
  } catch {
    return { status: "unknown", name };
  }
}

export function resolvePromptVariableValueForPlace(
  name: string,
  context: ThreadContext | undefined,
  placeKey: string | undefined,
  loadSkills: () => Promise<PromptSkill[]>
): Promise<VariableResolution> {
  if (!VARIABLE_NAME_RE.test(name)) {
    return Promise.resolve({ status: "invalid", name });
  }
  const frozen =
    placeKey === undefined
      ? undefined
      : context?.snapshot?.variables?.[placeKey]?.[name];
  if (frozen !== undefined) {
    return Promise.resolve({ status: "ok", value: frozen });
  }
  return resolvePromptVariableValue(name, context, loadSkills);
}

export function listPromptVariableCompletions(
  context: ThreadContext | undefined
): PromptVariableCompletion[] {
  const state = normalizePromptVariableState(context);
  const items: PromptVariableCompletion[] = [];
  for (const [name, variable] of Object.entries(state.variables)) {
    let hint: string;
    if (variable.type === "currentDate") {
      hint = formatCurrentDateVariable(variable.format);
    } else if (variable.type === "workingDirectory") {
      hint = variable.value.trim() ? _singleLine(variable.value) : "(empty)";
    } else if (variable.type === "json") {
      const value = formatJsonVariable(variable.value);
      hint = value ? _singleLine(value) : "(empty)";
    } else if (variable.type === "file") {
      hint = variable.value.trim() ? _singleLine(variable.value) : "(no file)";
    } else {
      hint = includesAllSkills(variable)
        ? "All enabled skills"
        : variable.skillNames.length === 0
          ? "No skills selected"
          : `${variable.skillNames.length} selected skill${
              variable.skillNames.length === 1 ? "" : "s"
            }`;
    }
    items.push({ name, hint });
  }
  const customValues =
    state.variableVariants.variants[DEFAULT_VARIABLE_VARIANT_NAME] ?? {};
  for (const [name, value] of Object.entries(customValues)) {
    items.push({ name, hint: value.trim() ? _singleLine(value) : "(empty)" });
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

function _singleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
