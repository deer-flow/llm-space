import type {
  AssistantMessage,
  Message,
  MessageContent,
  TextContent,
  Thread,
  ThreadContext,
  ThreadContextSnapshot,
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

export interface RenderedPromptVariable {
  placeKey: string;
  name: string;
  placeholder: string;
  value: string;
}

export interface RenderedSystemPrompt {
  systemPrompt: string;
  variables: RenderedPromptVariable[];
}

export interface RenderedThreadPromptVariables {
  context: ThreadContext;
  snapshot: ThreadContextSnapshot | undefined;
  variables: RenderedPromptVariable[];
}

/** A selectable variable for `{{`-triggered autocompletion. */
export interface PromptVariableCompletion {
  name: string;
  /** One-line value preview for the dropdown (skills show a short summary). */
  hint: string;
}

/** Outcome of resolving a single `{{name}}` placeholder for hover display. */
export type VariableResolution =
  | { status: "ok"; value: string }
  | { status: "empty"; name: string } // defined but blank/whitespace value
  | { status: "unknown"; name: string } // neither built-in nor a custom key
  | { status: "invalid"; name: string }; // name fails VARIABLE_NAME_RE

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
export const SYSTEM_PROMPT_PLACE_KEY = "systemPrompt";
const SIMPLE_PROMPT_VARIABLE_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** Build the durable placeholder inserted into the user's editable prompt. */
export function createPromptVariablePlaceholder(name: string): string {
  return `{{${name}}}`;
}

/** Stable snapshot key for the editable text surface of a message. */
export function createMessagePromptVariablePlaceKey(messageId: string): string {
  return `message:${messageId}:text`;
}

/** Stable snapshot key for the editable text surface of a tool result. */
export function createToolResultPromptVariablePlaceKey(
  messageId: string,
  toolCallId: string
): string {
  return `toolResult:${messageId}:${toolCallId}:text`;
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

/**
 * Replace placeholder references across every editable, model-facing text
 * surface. The editable templates stay as templates; frozen snapshot values are
 * renamed so already-run places keep their captured value after the variable's
 * display name changes.
 */
export function replaceThreadPromptVariableReferences(
  context: ThreadContext | undefined,
  oldName: string,
  newName: string
): ThreadContext {
  const next: ThreadContext = { ...(context ?? {}) };

  if (context?.systemPrompt !== undefined) {
    next.systemPrompt = replacePromptVariableReferences(
      context.systemPrompt,
      oldName,
      newName
    );
  }

  if (context?.messages) {
    next.messages = _replaceMessagesPromptVariableReferences(
      context.messages,
      oldName,
      newName
    );
  }

  const snapshot = _renamePromptVariableSnapshotReference(
    context?.snapshot,
    oldName,
    newName
  );
  if (snapshot === undefined) {
    delete next.snapshot;
  } else {
    next.snapshot = snapshot;
  }

  return next;
}

/**
 * Drop frozen values for prompt places whose editable source text changed.
 * Other places remain frozen, preserving cache-stable historical values.
 */
export function removePromptVariableSnapshotPlaces(
  snapshot: ThreadContextSnapshot | undefined,
  placeKeys: Iterable<string>
): ThreadContextSnapshot | undefined {
  const remove = new Set(placeKeys);
  if (remove.size === 0 || !snapshot?.variables) {
    return snapshot;
  }

  const variables = _normalizeSnapshotVariables(snapshot.variables);
  let changed = false;
  for (const placeKey of remove) {
    if (Object.prototype.hasOwnProperty.call(variables, placeKey)) {
      delete variables[placeKey];
      changed = true;
    }
  }

  return changed ? _buildSnapshot(snapshot, variables) : snapshot;
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

  const renderState = _createPromptVariableRenderState(state);
  const rendered: RenderedPromptVariable[] = [];
  const snapshotVariables: SnapshotVariables = {};
  const output = await _renderTextPromptVariables({
    text: systemPrompt,
    placeKey: SYSTEM_PROMPT_PLACE_KEY,
    snapshotVariables: {},
    nextSnapshotVariables: snapshotVariables,
    renderState,
    rendered,
  });
  return { systemPrompt: output, variables: rendered };
}

/**
 * Resolve prompt variables in every model-facing text surface while preserving
 * the stored templates. Existing `context.snapshot.variables` values win, so
 * old messages keep the same rendered bytes across later runs.
 */
export async function renderThreadPromptVariables({
  context,
}: {
  context: ThreadContext;
}): Promise<RenderedThreadPromptVariables> {
  const state = normalizePromptVariableState(context);
  _assertValidVariableState(state);

  const renderState = _createPromptVariableRenderState(state);
  const rendered: RenderedPromptVariable[] = [];
  const snapshotVariables = _normalizeSnapshotVariables(
    context.snapshot?.variables
  );
  const nextSnapshotVariables: SnapshotVariables = {};

  const systemPrompt =
    context.systemPrompt === undefined
      ? undefined
      : await _renderTextPromptVariables({
          text: context.systemPrompt,
          placeKey: SYSTEM_PROMPT_PLACE_KEY,
          snapshotVariables,
          nextSnapshotVariables,
          renderState,
          rendered,
        });

  const messages = context.messages
    ? await _renderMessagesPromptVariables({
        messages: context.messages,
        snapshotVariables,
        nextSnapshotVariables,
        renderState,
        rendered,
      })
    : undefined;

  const snapshot = _buildSnapshot(context.snapshot, nextSnapshotVariables);
  return {
    context: {
      ...context,
      ...(systemPrompt === undefined ? {} : { systemPrompt }),
      ...(messages === undefined ? {} : { messages }),
      ...(snapshot === undefined ? { snapshot: undefined } : { snapshot }),
    },
    snapshot,
    variables: rendered,
  };
}

/**
 * Resolve one variable by name WITHOUT any async work. Handles currentDate and
 * custom-string variables directly; returns `needsSkills` when the name is a
 * skills built-in so the caller can await the async path only when required.
 * Keeps the common hover (date / custom) fully synchronous.
 */
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
  if (builtIn?.type === "skills") {
    return { status: "needsSkills", variable: builtIn };
  }
  const customValues =
    state.variableVariants.variants[DEFAULT_VARIABLE_VARIANT_NAME] ?? {};
  if (!(name in customValues)) {
    return { status: "unknown", name };
  }
  const raw = customValues[name];
  return raw?.trim() ? { status: "ok", value: raw } : { status: "empty", name };
}

/**
 * Resolve one variable by name for hover display. Never throws. Mirrors the
 * three branches of the runtime resolver but is lenient (drops missing skills,
 * degrades load failures to `unknown`) since this is display-only. `loadSkills`
 * is injected so callers can share a cached skills list across many hovers.
 */
export async function resolvePromptVariableValue(
  name: string,
  context: ThreadContext | undefined,
  loadSkills: () => Promise<SkillInfo[]> = listEnabledPromptVariableSkills
): Promise<VariableResolution> {
  const fast = resolvePromptVariableValueSync(name, context);
  if (fast.status !== "needsSkills") {
    return fast;
  }
  try {
    const all = await loadSkills();
    const byName = new Map(all.map((skill) => [skill.name, skill]));
    // An empty selection means "all enabled skills".
    const selected =
      fast.variable.skillNames.length === 0
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

/**
 * Resolve a variable for display at a specific prompt place. Frozen snapshot
 * values take precedence; missing values fall back to the live variable config.
 */
export async function resolvePromptVariableValueForPlace(
  name: string,
  context: ThreadContext | undefined,
  placeKey: string | undefined,
  loadSkills: () => Promise<SkillInfo[]> = listEnabledPromptVariableSkills
): Promise<VariableResolution> {
  if (!VARIABLE_NAME_RE.test(name)) {
    return { status: "invalid", name };
  }
  const frozen =
    placeKey === undefined
      ? undefined
      : context?.snapshot?.variables?.[placeKey]?.[name];
  if (frozen !== undefined) {
    return { status: "ok", value: frozen };
  }
  return resolvePromptVariableValue(name, context, loadSkills);
}

/**
 * List every variable available for `{{`-triggered autocompletion (built-ins +
 * custom), each with a one-line, synchronous value preview. Skills show a short
 * summary rather than their full resolved list (which would require async IO).
 */
export function listPromptVariableCompletions(
  context: ThreadContext | undefined
): PromptVariableCompletion[] {
  const state = normalizePromptVariableState(context);
  const items: PromptVariableCompletion[] = [];
  for (const [name, variable] of Object.entries(state.variables)) {
    const hint =
      variable.type === "currentDate"
        ? formatCurrentDateVariable(variable.format)
        : variable.skillNames.length === 0
          ? "All enabled skills"
          : `${variable.skillNames.length} selected skill${
              variable.skillNames.length === 1 ? "" : "s"
            }`;
    items.push({ name, hint });
  }
  const customValues =
    state.variableVariants.variants[DEFAULT_VARIABLE_VARIANT_NAME] ?? {};
  for (const [name, value] of Object.entries(customValues)) {
    items.push({ name, hint: value.trim() ? _singleLine(value) : "(empty)" });
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

type SnapshotVariables = Record<string, Record<string, string>>;

interface PromptVariableRenderState {
  state: PromptVariableState;
  skills: Map<string, SkillInfo>;
  loadSkills: () => Promise<void>;
}

interface RenderTextPromptVariablesInput {
  text: string;
  placeKey: string;
  snapshotVariables: SnapshotVariables;
  nextSnapshotVariables: SnapshotVariables;
  renderState: PromptVariableRenderState;
  rendered: RenderedPromptVariable[];
}

function _replaceMessagesPromptVariableReferences(
  messages: Message[],
  oldName: string,
  newName: string
): Message[] {
  let changed = false;
  const next = messages.map((message) => {
    const replacedContent = _replaceMessageContentPromptVariableReferences(
      message.content,
      oldName,
      newName
    );
    const replacedToolCalls =
      message.role === "assistant"
        ? _replaceToolCallOutputPromptVariableReferences(
            message.toolCalls,
            oldName,
            newName
          )
        : undefined;

    if (
      replacedContent === message.content &&
      (message.role !== "assistant" || replacedToolCalls === message.toolCalls)
    ) {
      return message;
    }

    changed = true;
    return {
      ...message,
      content: replacedContent,
      ...(message.role === "assistant" ? { toolCalls: replacedToolCalls } : {}),
    } as Message;
  });

  return changed ? next : messages;
}

function _replaceMessageContentPromptVariableReferences(
  content: Message["content"],
  oldName: string,
  newName: string
): Message["content"] {
  let changed = false;
  const next = content.map((item) => {
    if (item.type !== "text") {
      return item;
    }
    const text = replacePromptVariableReferences(item.text, oldName, newName);
    if (text === item.text) {
      return item;
    }
    changed = true;
    return { ...item, text };
  });
  return changed ? next : content;
}

function _replaceToolCallOutputPromptVariableReferences(
  toolCalls: AssistantMessage["toolCalls"],
  oldName: string,
  newName: string
): AssistantMessage["toolCalls"] {
  if (!toolCalls?.length) {
    return toolCalls;
  }

  let changed = false;
  const next = toolCalls.map((toolCall) => {
    const output = toolCall.output;
    if (!output?.content.length) {
      return toolCall;
    }

    let outputChanged = false;
    const content = output.content.map((item) => {
      const text = replacePromptVariableReferences(item.text, oldName, newName);
      if (text === item.text) {
        return item;
      }
      outputChanged = true;
      return { ...item, text };
    });

    if (!outputChanged) {
      return toolCall;
    }

    changed = true;
    return { ...toolCall, output: { ...output, content } };
  });

  return changed ? next : toolCalls;
}

function _renamePromptVariableSnapshotReference(
  snapshot: ThreadContextSnapshot | undefined,
  oldName: string,
  newName: string
): ThreadContextSnapshot | undefined {
  if (!snapshot?.variables) {
    return snapshot;
  }

  const variables = _normalizeSnapshotVariables(snapshot.variables);
  let changed = false;
  for (const placeValues of Object.values(variables)) {
    if (!Object.prototype.hasOwnProperty.call(placeValues, oldName)) {
      continue;
    }
    placeValues[newName] = placeValues[oldName]!;
    delete placeValues[oldName];
    changed = true;
  }

  return changed ? _buildSnapshot(snapshot, variables) : snapshot;
}

function _createPromptVariableRenderState(
  state: PromptVariableState
): PromptVariableRenderState {
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
  return { state, skills, loadSkills };
}

async function _renderMessagesPromptVariables({
  messages,
  snapshotVariables,
  nextSnapshotVariables,
  renderState,
  rendered,
}: {
  messages: Message[];
  snapshotVariables: SnapshotVariables;
  nextSnapshotVariables: SnapshotVariables;
  renderState: PromptVariableRenderState;
  rendered: RenderedPromptVariable[];
}): Promise<Message[]> {
  const next: Message[] = [];
  for (const message of messages) {
    const placeKey = createMessagePromptVariablePlaceKey(message.id);
    let changed = false;
    const content: MessageContent[] = [];
    for (const item of message.content) {
      if (item.type !== "text") {
        content.push(item);
        continue;
      }
      const text = await _renderTextPromptVariables({
        text: item.text,
        placeKey,
        snapshotVariables,
        nextSnapshotVariables,
        renderState,
        rendered,
      });
      changed ||= text !== item.text;
      content.push(text === item.text ? item : { ...item, text });
    }

    let nextMessage = (changed ? { ...message, content } : message) as Message;
    if (nextMessage.role === "assistant") {
      nextMessage = await _renderAssistantToolResultsPromptVariables({
        message: nextMessage,
        snapshotVariables,
        nextSnapshotVariables,
        renderState,
        rendered,
      });
    }
    next.push(nextMessage);
  }
  return next;
}

async function _renderAssistantToolResultsPromptVariables({
  message,
  snapshotVariables,
  nextSnapshotVariables,
  renderState,
  rendered,
}: {
  message: AssistantMessage;
  snapshotVariables: SnapshotVariables;
  nextSnapshotVariables: SnapshotVariables;
  renderState: PromptVariableRenderState;
  rendered: RenderedPromptVariable[];
}): Promise<AssistantMessage> {
  if (!message.toolCalls?.length) {
    return message;
  }

  let changed = false;
  const toolCalls: NonNullable<AssistantMessage["toolCalls"]> = [];
  for (const toolCall of message.toolCalls) {
    const output = toolCall.output;
    if (!output?.content.length) {
      toolCalls.push(toolCall);
      continue;
    }

    const placeKey = createToolResultPromptVariablePlaceKey(
      message.id,
      toolCall.id
    );
    let outputChanged = false;
    const content: TextContent[] = [];
    for (const item of output.content) {
      const text = await _renderTextPromptVariables({
        text: item.text,
        placeKey,
        snapshotVariables,
        nextSnapshotVariables,
        renderState,
        rendered,
      });
      outputChanged ||= text !== item.text;
      content.push(text === item.text ? item : { ...item, text });
    }
    changed ||= outputChanged;
    toolCalls.push(
      outputChanged ? { ...toolCall, output: { ...output, content } } : toolCall
    );
  }

  return changed ? { ...message, toolCalls } : message;
}

async function _renderTextPromptVariables({
  text,
  placeKey,
  snapshotVariables,
  nextSnapshotVariables,
  renderState,
  rendered,
}: RenderTextPromptVariablesInput): Promise<string> {
  const matches = [...text.matchAll(SIMPLE_PROMPT_VARIABLE_RE)];
  if (matches.length === 0) {
    return text;
  }

  let placeValues = nextSnapshotVariables[placeKey];
  if (!placeValues) {
    placeValues = {};
    nextSnapshotVariables[placeKey] = placeValues;
  }
  const frozenPlaceValues = snapshotVariables[placeKey] ?? {};
  let output = "";
  let lastIndex = 0;

  for (const match of matches) {
    const index = match.index;
    if (index === undefined) {
      continue;
    }
    const placeholder = match[0];
    const name = _placeholderName(match[1], placeholder);
    let value = placeValues[name] ?? frozenPlaceValues[name];
    if (value === undefined) {
      value = await _renderVariableValue(name, renderState.state, {
        loadSkills: renderState.loadSkills,
        skills: renderState.skills,
      });
    }
    placeValues[name] = value;
    output += text.slice(lastIndex, index);
    output += value;
    rendered.push({ placeKey, name, placeholder, value });
    lastIndex = index + placeholder.length;
  }

  output += text.slice(lastIndex);
  return output;
}

function _normalizeSnapshotVariables(
  input: ThreadContextSnapshot["variables"]
): SnapshotVariables {
  if (!input || typeof input !== "object") {
    return {};
  }
  const variables: SnapshotVariables = {};
  for (const [placeKey, values] of Object.entries(input)) {
    if (!values || typeof values !== "object") {
      continue;
    }
    const placeValues: Record<string, string> = {};
    for (const [name, value] of Object.entries(values)) {
      if (typeof value === "string") {
        placeValues[name] = value;
      }
    }
    if (Object.keys(placeValues).length > 0) {
      variables[placeKey] = placeValues;
    }
  }
  return variables;
}

function _buildSnapshot(
  snapshot: ThreadContextSnapshot | undefined,
  variables: SnapshotVariables
): ThreadContextSnapshot | undefined {
  const next: ThreadContextSnapshot = { ...(snapshot ?? {}) };
  if (Object.keys(variables).length > 0) {
    next.variables = variables;
  } else {
    delete next.variables;
  }
  return Object.keys(next).length > 0 ? next : undefined;
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
    await loadSkills();
    // An empty selection means "all enabled skills" — the default that keeps
    // newly-added skills included without re-editing the variable.
    const selected =
      builtIn.skillNames.length === 0
        ? [...skills.values()]
        : builtIn.skillNames.map((skillName) => {
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
      `<skill name="${_escapeXml(skill.name)}" path="${_escapeXml(skill.path)}">`,
      `${_escapeXml(_singleLine(skill.description))}`,
      "</skill>",
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
    .join("\n\n");
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
