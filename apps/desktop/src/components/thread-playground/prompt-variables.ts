import type {
  Thread,
  ThreadContext,
  ThreadCurrentDateVariable,
  ThreadCurrentDateVariableFormat,
  ThreadSkillsVariable,
  ThreadSkillsVariableFormat,
  ThreadVariable,
  ThreadVariableVariants,
  ThreadVariables,
} from "@llm-space/core";

import { getSkillsSettings, listSkills } from "@/client/skills";
import type { SkillInfo } from "@/shared/skills";

export type PromptDateVariableFormat = ThreadCurrentDateVariableFormat;
export type PromptSkillsVariableFormat = ThreadSkillsVariableFormat;

export interface PromptVariableFormatOption<T extends string> {
  value: T;
  label: string;
}

export interface PromptVariableState {
  variables: ThreadVariables;
  variableVariants: ThreadVariableVariants;
}

export interface RenderedSystemPrompt {
  systemPrompt: string;
  variables: { placeholder: string; value: string }[];
}

export class PromptVariableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptVariableError";
  }
}

export const VARIABLE_NAME_PATTERN = "[A-Za-z_][A-Za-z0-9_]*";
export const VARIABLE_NAME_RE = new RegExp(`^${VARIABLE_NAME_PATTERN}$`);

export const PROMPT_DATE_FORMATS: readonly PromptVariableFormatOption<PromptDateVariableFormat>[] =
  [
    { value: "readable-date", label: "Readable date" },
    { value: "iso-date", label: "ISO date" },
    { value: "local-date-time", label: "Local date and time" },
  ];

export const PROMPT_SKILLS_FORMATS: readonly PromptVariableFormatOption<PromptSkillsVariableFormat>[] =
  [
    { value: "xml", label: "XML" },
    { value: "markdown-list", label: "Markdown list" },
  ];

export const PROMPT_SKILLS_INDENTS = [0, 2, 4] as const;

const DEFAULT_CURRENT_DATE_NAME = "current_date";
const DEFAULT_SKILLS_NAME = "available_skills";
export const DEFAULT_VARIABLE_VARIANT_NAME = "default";
const SIMPLE_PROMPT_VARIABLE_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** Build the durable placeholder inserted into the user's editable prompt. */
export function createPromptVariablePlaceholder(name: string): string {
  return `{{${name}}}`;
}

/** Replace exact placeholder references after a variable has been renamed. */
export function replacePromptVariableReferences(
  systemPrompt: string,
  oldName: string,
  newName: string
): string {
  const re = new RegExp(`\\{\\{\\s*${_escapeRegExp(oldName)}\\s*\\}\\}`, "g");
  return systemPrompt.replace(re, createPromptVariablePlaceholder(newName));
}

/** Return the default built-in variable definitions for a thread. */
export function createDefaultThreadVariables(): ThreadVariables {
  return {
    [DEFAULT_CURRENT_DATE_NAME]: {
      type: "currentDate",
      format: "readable-date",
    },
    [DEFAULT_SKILLS_NAME]: {
      type: "skills",
      skillNames: [],
      format: "markdown-list",
      indent: 0,
    },
  };
}

/** Return the single custom-variable value set for a thread. */
export function createDefaultThreadVariableVariants(): ThreadVariableVariants {
  return {
    active: DEFAULT_VARIABLE_VARIANT_NAME,
    variants: { [DEFAULT_VARIABLE_VARIANT_NAME]: {} },
  };
}

/** Materialize missing variable state without mutating the incoming thread. */
export function ensureThreadVariableState(thread: Thread): Thread {
  const context = thread.context ?? {};
  const state = normalizePromptVariableState(context);
  if (
    context.variables === state.variables &&
    context.variableVariants === state.variableVariants
  ) {
    return thread;
  }
  return {
    ...thread,
    context: {
      ...context,
      variables: state.variables,
      variableVariants: state.variableVariants,
    },
  };
}

/** Normalize variable state enough that the panel always has rows to render. */
export function normalizePromptVariableState(
  context?: ThreadContext
): PromptVariableState {
  const variables = _normalizeThreadVariables(context?.variables);
  return {
    variables,
    variableVariants: _normalizeThreadVariableVariants(
      context?.variableVariants
    ),
  };
}

/** Format the current system date in a stable, local-time representation. */
export function formatCurrentDateVariable(
  format: PromptDateVariableFormat,
  date = new Date()
): string {
  const { dateText, timeText } = _localDateParts(date);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
  switch (format) {
    case "readable-date":
      return `${dateText}, ${_weekday(date)}`;
    case "iso-date":
      return dateText;
    case "local-date-time":
      return `${dateText} ${timeText} ${_timeZoneOffset(date)} (${timeZone})`;
  }
}

/** Format a group of selected skills without inlining their full instructions. */
export function formatSkillsVariable(
  skills: SkillInfo[],
  variable: ThreadSkillsVariable
): string {
  const value =
    variable.format === "xml"
      ? _formatSkillsXml(skills)
      : _formatSkillsMarkdownList(skills);
  return _indentLines(value, variable.indent);
}

/**
 * List enabled skills across all configured discovery folders, de-duped by
 * name. Reuses the Settings skill model so prompt variables cannot see hidden
 * skills the runtime `skill()` tool would reject.
 */
export async function listEnabledPromptVariableSkills(): Promise<SkillInfo[]> {
  const { discoveryPaths } = await getSkillsSettings();
  const perPath = await Promise.all(
    discoveryPaths.map((entry) =>
      listSkills(entry.path).catch((): SkillInfo[] => [])
    )
  );
  const byName = new Map<string, SkillInfo>();
  for (const skill of perPath.flat()) {
    if (skill.enabled && !byName.has(skill.name)) {
      byName.set(skill.name, skill);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve supported prompt variables into the concrete system prompt sent to
 * the model. The caller keeps the stored thread template untouched.
 */
export async function renderSystemPromptVariables({
  systemPrompt,
  context,
}: {
  systemPrompt: string;
  context?: ThreadContext;
}): Promise<RenderedSystemPrompt> {
  const state = normalizePromptVariableState(context);
  _assertValidVariableState(state);

  const matches = [...systemPrompt.matchAll(SIMPLE_PROMPT_VARIABLE_RE)];
  if (matches.length === 0) {
    return { systemPrompt, variables: [] };
  }

  const skills = new Map<string, SkillInfo>();
  let loadedSkills: Promise<void> | null = null;
  const loadSkills = async () => {
    loadedSkills ??= listEnabledPromptVariableSkills().then((items) => {
      for (const item of items) {
        skills.set(item.name, item);
      }
    });
    await loadedSkills;
  };

  const rendered: RenderedSystemPrompt["variables"] = [];
  let output = "";
  let lastIndex = 0;

  for (const match of matches) {
    const index = match.index;
    if (index === undefined) {
      continue;
    }
    const placeholder = match[0];
    const name = _placeholderName(match[1], placeholder);
    const value = await _renderVariableValue(name, state, {
      loadSkills,
      skills,
    });
    output += systemPrompt.slice(lastIndex, index);
    output += value;
    rendered.push({ placeholder, value });
    lastIndex = index + placeholder.length;
  }

  output += systemPrompt.slice(lastIndex);
  return { systemPrompt: output, variables: rendered };
}

function _normalizeThreadVariables(
  input: ThreadContext["variables"]
): ThreadVariables {
  const source =
    input && typeof input === "object" ? Object.entries(input) : [];
  const variables: ThreadVariables = {};
  const used = new Set<string>();
  let hasCurrentDate = false;
  let hasSkills = false;

  for (const [name, value] of source) {
    if (!_isThreadVariable(value)) {
      continue;
    }
    const normalized =
      value.type === "currentDate"
        ? _normalizeCurrentDateVariable(value)
        : _normalizeSkillsVariable(value);
    variables[name] = normalized;
    used.add(name);
    hasCurrentDate ||= normalized.type === "currentDate";
    hasSkills ||= normalized.type === "skills";
  }

  if (!hasCurrentDate) {
    const name = _uniqueName(DEFAULT_CURRENT_DATE_NAME, used);
    variables[name] =
      createDefaultThreadVariables()[DEFAULT_CURRENT_DATE_NAME]!;
    used.add(name);
  }

  if (!hasSkills) {
    const name = _uniqueName(DEFAULT_SKILLS_NAME, used);
    variables[name] = createDefaultThreadVariables()[DEFAULT_SKILLS_NAME]!;
  }

  return variables;
}

function _normalizeThreadVariableVariants(
  input: ThreadContext["variableVariants"]
): ThreadVariableVariants {
  if (!input || typeof input !== "object") {
    return createDefaultThreadVariableVariants();
  }
  const sourceValues = _defaultCustomValues(input);
  return {
    active: DEFAULT_VARIABLE_VARIANT_NAME,
    variants: { [DEFAULT_VARIABLE_VARIANT_NAME]: sourceValues },
  };
}

function _defaultCustomValues(
  input: ThreadContext["variableVariants"]
): Record<string, string> {
  const variants = input?.variants ?? {};
  const selectedValues =
    typeof input?.active === "string" ? variants[input.active] : undefined;
  const source =
    variants[DEFAULT_VARIABLE_VARIANT_NAME] ??
    selectedValues ??
    Object.values(variants)[0] ??
    {};
  if (!source || typeof source !== "object") {
    return {};
  }
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") {
      values[key] = value;
    }
  }
  return values;
}

function _normalizeCurrentDateVariable(
  value: ThreadCurrentDateVariable
): ThreadCurrentDateVariable {
  return {
    type: "currentDate",
    format: _isDateFormat(value.format) ? value.format : "readable-date",
  };
}

function _normalizeSkillsVariable(
  value: ThreadSkillsVariable
): ThreadSkillsVariable {
  return {
    type: "skills",
    skillNames: Array.isArray(value.skillNames)
      ? value.skillNames.filter((name) => typeof name === "string")
      : [],
    format: _isSkillsFormat(value.format) ? value.format : "xml",
    indent: _normalizeIndent(value.indent),
  };
}

function _assertValidVariableState(state: PromptVariableState): void {
  const variableNames = Object.keys(state.variables);
  for (const name of variableNames) {
    _assertVariableName(name, `Variable name "${name}" is invalid.`);
  }

  const customValues =
    state.variableVariants.variants[DEFAULT_VARIABLE_VARIANT_NAME] ?? {};

  const customNames = new Set<string>();
  for (const name of Object.keys(customValues)) {
    _assertVariableName(name, `Custom variable name "${name}" is invalid.`);
    customNames.add(name);
  }

  for (const name of customNames) {
    if (name in state.variables) {
      throw new PromptVariableError(
        `Variable "${name}" is defined as both a built-in and a custom variable.`
      );
    }
  }
}

async function _renderVariableValue(
  name: string,
  state: PromptVariableState,
  {
    loadSkills,
    skills,
  }: {
    loadSkills: () => Promise<void>;
    skills: Map<string, SkillInfo>;
  }
): Promise<string> {
  const builtIn = state.variables[name];
  if (builtIn) {
    if (builtIn.type === "currentDate") {
      return formatCurrentDateVariable(builtIn.format);
    }
    if (builtIn.skillNames.length === 0) {
      throw new PromptVariableError(
        `Variable "${name}" has no skills selected. Select at least one skill in the Variables panel.`
      );
    }
    await loadSkills();
    const selected = builtIn.skillNames.map((skillName) => {
      const skill = skills.get(skillName);
      if (!skill) {
        throw new PromptVariableError(
          `Skill "${skillName}" in variable "${name}" is not enabled or cannot be found.`
        );
      }
      return skill;
    });
    return formatSkillsVariable(selected, builtIn);
  }

  const customValues =
    state.variableVariants.variants[DEFAULT_VARIABLE_VARIANT_NAME] ?? {};
  if (!(name in customValues)) {
    throw new PromptVariableError(`Variable "${name}" is missing.`);
  }
  const value = customValues[name]?.trim();
  if (!value) {
    throw new PromptVariableError(`Variable "${name}" is empty.`);
  }
  return customValues[name];
}

function _placeholderName(raw: string, placeholder: string): string {
  const name = raw.trim();
  if (name.startsWith("llm_space.")) {
    throw new PromptVariableError(
      `Legacy prompt variable "${placeholder}" is no longer supported. Configure it in the Variables panel and use {{variable_name}}.`
    );
  }
  _assertVariableName(
    name,
    `Invalid prompt variable "${placeholder}". Use {{variable_name}}.`
  );
  return name;
}

function _assertVariableName(name: string, message: string): void {
  if (!VARIABLE_NAME_RE.test(name)) {
    throw new PromptVariableError(message);
  }
}

function _formatSkillsXml(skills: SkillInfo[]): string {
  return [
    "<available-skills>",
    ...skills.flatMap((skill) => [
      `  <skill name="${_escapeXml(skill.name)}">`,
      `    <description>${_escapeXml(_singleLine(skill.description))}</description>`,
      `    <path>${_escapeXml(skill.path)}</path>`,
      "  </skill>",
    ]),
    "</available-skills>",
  ].join("\n");
}

function _formatSkillsMarkdownList(skills: SkillInfo[]): string {
  return skills
    .map(
      (skill) =>
        `- **${_escapeMarkdownCode(skill.name)}**: ${_singleLine(skill.description)}`
    )
    .join("\n");
}

function _indentLines(value: string, indent: number): string {
  const normalized = _normalizeIndent(indent);
  if (normalized === 0) {
    return value;
  }
  const prefix = " ".repeat(normalized);
  return value
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function _isThreadVariable(value: unknown): value is ThreadVariable {
  if (!value || typeof value !== "object") {
    return false;
  }
  const type = (value as { type?: unknown }).type;
  return type === "currentDate" || type === "skills";
}

function _isDateFormat(value: unknown): value is PromptDateVariableFormat {
  return (
    value === "readable-date" ||
    value === "iso-date" ||
    value === "local-date-time"
  );
}

function _isSkillsFormat(value: unknown): value is PromptSkillsVariableFormat {
  return value === "xml" || value === "markdown-list";
}

function _normalizeIndent(value: unknown): 0 | 2 | 4 {
  return value === 2 || value === 4 ? value : 0;
}

function _localDateParts(date: Date): { dateText: string; timeText: string } {
  const year = date.getFullYear();
  const month = _pad(date.getMonth() + 1);
  const day = _pad(date.getDate());
  const hours = _pad(date.getHours());
  const minutes = _pad(date.getMinutes());
  const seconds = _pad(date.getSeconds());
  return {
    dateText: `${year}-${month}-${day}`,
    timeText: `${hours}:${minutes}:${seconds}`,
  };
}

function _weekday(date: Date): string {
  return new Intl.DateTimeFormat("en", { weekday: "long" }).format(date);
}

function _timeZoneOffset(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const absolute = Math.abs(offset);
  const hours = _pad(Math.floor(absolute / 60));
  const minutes = _pad(absolute % 60);
  return `GMT${sign}${hours}:${minutes}`;
}

function _pad(value: number): string {
  return String(value).padStart(2, "0");
}

function _uniqueName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    return base;
  }
  let index = 2;
  while (used.has(`${base}_${index}`)) {
    index += 1;
  }
  return `${base}_${index}`;
}

function _singleLine(value: string): string {
  return value.trim().replace(/\s+/g, " ") || "No description";
}

function _escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function _escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _escapeMarkdownCode(value: string): string {
  return value.replace(/`/g, "\\`");
}
