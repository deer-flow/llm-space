import type { PiThreadContext } from "../types/agent";
import type { ToolCallOutput } from "../types/messages";
import type { ThreadContext } from "../types/threads";

import {
  normalizeAgentStatusSettings,
  resolveAgentStatusWorkingDirectory,
  type NormalizedAgentStatusSettings,
} from "./thread";
import {
  type AgentStatusComponent,
  type AgentStatusEnvironment,
  type AgentStatusError,
  type AgentStatusEffect,
  type AgentStatusSnapshot,
  type AgentStatusToolCallMetadata,
  type AgentTodoItem,
  type AgentTodoStatus,
} from "./types";

export interface CreateAgentStatusRuntimeOptions {
  now?: () => number;
  createId?: () => string;
  environment?: AgentStatusEnvironment;
}

export type AgentStatusToolOutcome =
  | {
      ok: true;
      output: ToolCallOutput;
      effects?: AgentStatusEffect[];
    }
  | { ok: false; error: unknown };

export interface CompleteAgentStatusToolCallInput {
  context: ThreadContext;
  toolName: string;
  arguments: Record<string, unknown>;
  outcome: AgentStatusToolOutcome;
}

export interface AgentStatusRuntime {
  prepareContext(context: PiThreadContext): Promise<PiThreadContext>;
  completeToolCall(
    input: CompleteAgentStatusToolCallInput
  ): Promise<ToolCallOutput>;
  snapshot(context: ThreadContext): AgentStatusSnapshot;
}

interface RuntimeState {
  toolCounts: Record<string, number>;
  todos: AgentTodoItem[];
  lastError?: AgentStatusError;
}

const TODO_TOOL_NAMES = new Set([
  "todo_write",
  "rewrite_todo_list",
  "update_todo_status",
]);
const TODO_STATUSES = new Set<AgentTodoStatus>([
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);
const AGENT_STATUS_MESSAGE_MARKER = "__llmSpaceAgentStatus";
const UNAVAILABLE_ENVIRONMENT: AgentStatusEnvironment = {
  currentTime: "unavailable",
  workingDirectory: "unavailable",
  platform: "unavailable",
  arch: "unavailable",
  shell: "unavailable",
  pythonVersion: "unavailable",
};

type AgentStatusApiMessage = PiThreadContext["messages"][number] & {
  [AGENT_STATUS_MESSAGE_MARKER]: true;
};

/** 判断消息是否为 Harness 临时生成、且不得持久化的 Agent Status 消息。 */
export function isAgentStatusApiMessage(message: unknown): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    AGENT_STATUS_MESSAGE_MARKER in message &&
    (message as Record<string, unknown>)[AGENT_STATUS_MESSAGE_MARKER] === true
  );
}

/** 每次模型 API 调用前只保留最新一条状态消息，并把它放到上下文末尾。 */
export function moveAgentStatusMessageToEnd<T>(messages: readonly T[]): T[] {
  let latestStatus: T | undefined;
  const transcript: T[] = [];
  for (const message of messages) {
    if (isAgentStatusApiMessage(message)) {
      latestStatus = message;
    } else {
      transcript.push(message);
    }
  }
  return latestStatus === undefined
    ? [...messages]
    : [...transcript, latestStatus];
}

export function createAgentStatusRuntime(
  options: CreateAgentStatusRuntimeOptions = {}
): AgentStatusRuntime {
  const now = options.now ?? Date.now;
  const createId =
    options.createId ??
    (() =>
      "todo-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10));
  const baseEnvironment = {
    ...UNAVAILABLE_ENVIRONMENT,
    ...options.environment,
  };
  let activeContext: ThreadContext | undefined;
  let settings = _settingsFromContext({});
  let activeWorkingDirectory = baseEnvironment.workingDirectory;
  let state: RuntimeState = _emptyState();

  function activate(context: ThreadContext): void {
    if (context === activeContext) return;
    activeContext = context;
    settings = _settingsFromContext(context);
    const persistedWorkingDirectory =
      resolveAgentStatusWorkingDirectory(context);
    activeWorkingDirectory =
      persistedWorkingDirectory ??
      _workingDirectoryFromEffects(context, baseEnvironment.workingDirectory);
    state = _rebuildState(context, settings);
  }

  function prepareContext(context: PiThreadContext): Promise<PiThreadContext> {
    const contextSettings = normalizeAgentStatusSettings({
      components: context.agentStatus?.components ?? settings.components,
      simulatedTimeOffsetMs:
        context.agentStatus?.simulatedTimeOffsetMs ??
        settings.simulatedTimeOffsetMs,
    });
    const enabled = new Set(contextSettings.components);
    const workingDirectory =
      context.agentStatus?.workingDirectory ?? activeWorkingDirectory;
    const transcript = context.messages.filter(
      (message) => !isAgentStatusApiMessage(message)
    );
    if (enabled.size === 0) {
      return Promise.resolve(
        transcript.length === context.messages.length
          ? context
          : { ...context, messages: transcript }
      );
    }

    const currentTimestamp = now() + contextSettings.simulatedTimeOffsetMs;
    const statusState = _rebuildPiState(context, enabled);
    const statusMessage = {
      role: "user",
      content: [
        {
          type: "text",
          text: _renderAgentStatus({
            enabled,
            currentTimestamp,
            workingDirectory,
            environment: baseEnvironment,
            state: statusState,
          }),
        },
      ],
      timestamp: currentTimestamp,
      [AGENT_STATUS_MESSAGE_MARKER]: true,
    } as AgentStatusApiMessage;

    return Promise.resolve({
      ...context,
      messages: [...transcript, statusMessage],
    });
  }

  function completeToolCall({
    context,
    toolName,
    arguments: toolArguments,
    outcome,
  }: CompleteAgentStatusToolCallInput): Promise<ToolCallOutput> {
    activate(context);
    const enabled = new Set(settings.components);
    const observedTimestamp = now() + (settings.simulatedTimeOffsetMs ?? 0);
    const ordinal = enabled.has("tool-counter")
      ? (state.toolCounts[toolName] ?? 0) + 1
      : undefined;
    if (ordinal !== undefined) state.toolCounts[toolName] = ordinal;

    let output: ToolCallOutput;
    let detailedError: AgentStatusError | undefined;
    let todos: AgentTodoItem[] | undefined;
    if (outcome.ok) {
      output = { ...outcome.output, content: [...outcome.output.content] };
      if (enabled.has("todos") && TODO_TOOL_NAMES.has(toolName)) {
        const todoResult =
          toolName === "update_todo_status"
            ? _updateTodoStatus(state.todos, toolArguments, observedTimestamp)
            : _rewriteTodos(
                state.todos,
                toolArguments,
                observedTimestamp,
                createId
              );
        if (todoResult.ok) {
          state.todos = todoResult.todos;
          todos = _cloneTodos(state.todos);
          output = { ...output, isError: false };
        } else {
          const formatted = _errorOutput(
            todoResult.error,
            toolArguments,
            enabled.has("detailed-errors"),
            activeWorkingDirectory
          );
          output = formatted.output;
          detailedError = formatted.metadata;
        }
      }
    } else {
      const formatted = _errorOutput(
        outcome.error,
        toolArguments,
        enabled.has("detailed-errors"),
        activeWorkingDirectory
      );
      output = formatted.output;
      detailedError = formatted.metadata;
    }
    if (detailedError) state.lastError = detailedError;

    const metadata: AgentStatusToolCallMetadata = {
      ...output.agentStatus,
      ...(enabled.has("timestamps") ? { timestamp: observedTimestamp } : {}),
      ...(ordinal === undefined ? {} : { ordinal }),
      ...(todos === undefined ? {} : { todos }),
      ...(detailedError === undefined ? {} : { error: detailedError }),
      ...(outcome.ok && outcome.effects ? { effects: outcome.effects } : {}),
    };
    for (const effect of metadata.effects ?? []) {
      if (effect.type === "working-directory") {
        activeWorkingDirectory = effect.workingDirectory;
      }
    }
    return Promise.resolve({
      ...output,
      ...(Object.keys(metadata).length > 0 ? { agentStatus: metadata } : {}),
    });
  }

  function snapshot(context: ThreadContext): AgentStatusSnapshot {
    activate(context);
    const currentTimestamp = now() + (settings.simulatedTimeOffsetMs ?? 0);
    return {
      now: currentTimestamp,
      components: [...(settings.components ?? [])],
      toolCounts: { ...state.toolCounts },
      todos: _cloneTodos(state.todos),
      ...(state.lastError ? { lastError: _cloneError(state.lastError) } : {}),
      workingDirectory: activeWorkingDirectory,
      environment: {
        ...baseEnvironment,
        currentTime: _formatTimestamp(currentTimestamp),
        workingDirectory: activeWorkingDirectory,
      },
    };
  }

  return { prepareContext, completeToolCall, snapshot };
}

function _settingsFromContext(
  context: ThreadContext
): NormalizedAgentStatusSettings {
  return normalizeAgentStatusSettings(context.agentStatus);
}

function _emptyState(): RuntimeState {
  return { toolCounts: {}, todos: [] };
}

function _rebuildState(
  context: ThreadContext,
  settings: NormalizedAgentStatusSettings
): RuntimeState {
  const enabled = new Set(settings.components);
  const rebuilt = _emptyState();
  for (const message of context.messages ?? []) {
    if (message.role !== "assistant") continue;
    for (const toolCall of message.toolCalls ?? []) {
      if (!toolCall.output) continue;
      if (_isPendingPlaceholder(toolCall.output)) continue;
      const metadata = toolCall.output?.agentStatus;
      if (enabled.has("tool-counter")) {
        rebuilt.toolCounts[toolCall.input.name] = Math.max(
          rebuilt.toolCounts[toolCall.input.name] ?? 0,
          metadata?.ordinal ??
            (rebuilt.toolCounts[toolCall.input.name] ?? 0) + 1
        );
      }
      if (enabled.has("todos") && metadata?.todos) {
        rebuilt.todos = _cloneTodos(metadata.todos);
      }
      if (enabled.has("detailed-errors") && metadata?.error) {
        rebuilt.lastError = _cloneError(metadata.error);
      }
    }
  }
  return rebuilt;
}

function _isPendingPlaceholder(output: ToolCallOutput): boolean {
  return (
    output.agentStatus === undefined &&
    output.isError === undefined &&
    output.content.length > 0 &&
    output.content.every(
      (part) => part.type === "text" && part.text.trim().length === 0
    )
  );
}

function _workingDirectoryFromEffects(
  context: ThreadContext,
  fallback: string
): string {
  let workingDirectory = fallback;
  for (const message of context.messages ?? []) {
    if (message.role !== "assistant") continue;
    for (const toolCall of message.toolCalls ?? []) {
      for (const effect of toolCall.output?.agentStatus?.effects ?? []) {
        if (effect.type === "working-directory") {
          workingDirectory = effect.workingDirectory;
        }
      }
    }
  }
  return workingDirectory;
}

function _rebuildPiState(
  context: PiThreadContext,
  enabled: ReadonlySet<AgentStatusComponent>
): RuntimeState {
  const rebuilt = _emptyState();
  for (const message of context.messages) {
    if (message.role !== "toolResult") continue;
    const toolResult = message as typeof message & {
      toolCallId?: string;
      toolName?: string;
    };
    const toolName = toolResult.toolName ?? "unknown";
    const metadata = toolResult.toolCallId
      ? context.agentStatus?.toolCallMetadata?.[toolResult.toolCallId]
      : undefined;
    if (enabled.has("tool-counter")) {
      rebuilt.toolCounts[toolName] = Math.max(
        rebuilt.toolCounts[toolName] ?? 0,
        metadata?.ordinal ?? (rebuilt.toolCounts[toolName] ?? 0) + 1
      );
    }
    if (enabled.has("todos") && metadata?.todos) {
      rebuilt.todos = _cloneTodos(metadata.todos);
    }
    if (enabled.has("detailed-errors") && metadata?.error) {
      rebuilt.lastError = _cloneError(metadata.error);
    }
  }
  return rebuilt;
}

function _renderAgentStatus({
  enabled,
  currentTimestamp,
  workingDirectory,
  environment,
  state,
}: {
  enabled: ReadonlySet<AgentStatusComponent>;
  currentTimestamp: number;
  workingDirectory: string;
  environment: AgentStatusEnvironment;
  state: RuntimeState;
}): string {
  const lines = ["<agent_status>", "Current State:"];
  if (enabled.has("timestamps") || enabled.has("system")) {
    lines.push(`- Current time: ${_formatTimestamp(currentTimestamp)}`);
  }
  _appendToolCounts(lines, enabled, state.toolCounts);
  _appendTodos(lines, enabled, state.todos);
  _appendLastError(lines, enabled, state.lastError);
  if (enabled.has("system")) {
    lines.push("- System:");
    lines.push(
      `  - Working directory: ${_escapeAgentStatus(workingDirectory)}`,
      `  - Platform: ${_escapeAgentStatus(environment.platform)}/${_escapeAgentStatus(environment.arch)}`,
      `  - Shell: ${_escapeAgentStatus(environment.shell)}`,
      `  - Python: ${_escapeAgentStatus(environment.pythonVersion)}`
    );
  }
  lines.push("</agent_status>");
  return lines.join("\n");
}

function _appendToolCounts(
  lines: string[],
  enabled: ReadonlySet<AgentStatusComponent>,
  toolCounts: Readonly<Record<string, number>>
): void {
  if (!enabled.has("tool-counter")) return;
  const counts = Object.entries(toolCounts).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  lines.push("- Tool calls:");
  if (counts.length === 0) {
    lines.push("  - none");
    return;
  }
  for (const [name, count] of counts) {
    lines.push(`  - ${_escapeAgentStatus(name)}: ${count}`);
  }
}

function _appendTodos(
  lines: string[],
  enabled: ReadonlySet<AgentStatusComponent>,
  todos: readonly AgentTodoItem[]
): void {
  if (!enabled.has("todos")) return;
  lines.push("- TODO:");
  if (todos.length === 0) {
    lines.push("  - none");
    return;
  }
  for (const todo of todos) {
    lines.push(
      `  - [${_escapeAgentStatus(todo.id)}] ${_escapeAgentStatus(todo.content)} (${todo.status}) @ ${_formatTimestamp(todo.timestamp)}`
    );
  }
}

function _appendLastError(
  lines: string[],
  enabled: ReadonlySet<AgentStatusComponent>,
  error: AgentStatusError | undefined
): void {
  if (!enabled.has("detailed-errors")) return;
  lines.push("- Last error:");
  if (!error) {
    lines.push("  - none");
    return;
  }
  lines.push(`  - Type: ${_escapeAgentStatus(error.type)}`);
  lines.push(`  - Description: ${_escapeAgentStatus(error.description)}`);
  _appendAgentStatusBlock(lines, "Arguments JSON", error.argumentsJson);
  _appendAgentStatusBlock(lines, "Stack", error.stack);
  lines.push("  - Suggestions:");
  for (const suggestion of error.suggestions) {
    lines.push(`    - ${_escapeAgentStatus(suggestion)}`);
  }
}

function _appendAgentStatusBlock(
  lines: string[],
  label: string,
  value: string
): void {
  const escapedLines = _escapeAgentStatus(value).split(/\r?\n/);
  lines.push(`  - ${label}: ${escapedLines[0] ?? ""}`);
  for (const line of escapedLines.slice(1)) {
    lines.push(`    ${line}`);
  }
}

function _escapeAgentStatus(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function _formatTimestamp(timestamp: number): string {
  if (timestamp === 0) return "时间不可用";
  return new Date(timestamp).toISOString();
}

function _rewriteTodos(
  currentTodos: readonly AgentTodoItem[],
  toolArguments: Record<string, unknown>,
  timestamp: number,
  createId: () => string
): { ok: true; todos: AgentTodoItem[] } | { ok: false; error: Error } {
  const rawTodos = toolArguments.todos;
  if (!Array.isArray(rawTodos)) {
    return {
      ok: false,
      error: _namedError("TodoValidationError", "todos 必须是数组。"),
    };
  }

  const currentById = new Map(currentTodos.map((todo) => [todo.id, todo]));
  const usedIds = new Set<string>();
  const nextTodos: AgentTodoItem[] = [];
  for (const rawTodo of rawTodos) {
    if (!_isRecord(rawTodo)) {
      return {
        ok: false,
        error: _namedError("TodoValidationError", "每个 TODO 项必须是对象。"),
      };
    }
    const content = rawTodo.content;
    const status = rawTodo.status;
    const requestedId = rawTodo.id;
    if (typeof content !== "string" || content.trim().length === 0) {
      return {
        ok: false,
        error: _namedError(
          "TodoValidationError",
          "TODO 内容必须是非空字符串。"
        ),
      };
    }
    if (
      typeof status !== "string" ||
      !TODO_STATUSES.has(status as AgentTodoStatus)
    ) {
      return {
        ok: false,
        error: _namedError("TodoValidationError", "TODO 状态无效。"),
      };
    }
    if (
      requestedId !== undefined &&
      (typeof requestedId !== "string" || requestedId.trim().length === 0)
    ) {
      return {
        ok: false,
        error: _namedError(
          "TodoValidationError",
          "TODO 标识符必须是非空字符串。"
        ),
      };
    }

    let id = requestedId;
    if (id && usedIds.has(id)) {
      return {
        ok: false,
        error: _namedError("TodoValidationError", "TODO 标识符重复：" + id),
      };
    }
    if (!id) {
      id = _nextUniqueId(createId, usedIds);
      if (!id) {
        return {
          ok: false,
          error: _namedError(
            "TodoIdGenerationError",
            "无法生成唯一的 TODO 标识符。"
          ),
        };
      }
    }
    usedIds.add(id);
    const previous = currentById.get(id);
    nextTodos.push({
      id,
      content,
      status: status as AgentTodoStatus,
      timestamp:
        previous?.content === content && previous.status === status
          ? previous.timestamp
          : timestamp,
    });
  }
  return { ok: true, todos: nextTodos };
}

function _updateTodoStatus(
  currentTodos: readonly AgentTodoItem[],
  toolArguments: Record<string, unknown>,
  timestamp: number
): { ok: true; todos: AgentTodoItem[] } | { ok: false; error: Error } {
  const id = toolArguments.id;
  const status = toolArguments.status;
  if (typeof id !== "string" || id.trim().length === 0) {
    return {
      ok: false,
      error: _namedError(
        "TodoValidationError",
        "TODO 标识符必须是非空字符串。"
      ),
    };
  }
  if (
    typeof status !== "string" ||
    !TODO_STATUSES.has(status as AgentTodoStatus)
  ) {
    return {
      ok: false,
      error: _namedError("TodoValidationError", "TODO 状态无效。"),
    };
  }
  if (!currentTodos.some((todo) => todo.id === id)) {
    return {
      ok: false,
      error: _namedError("TodoNotFoundError", "未知 TODO 标识符：" + id),
    };
  }
  return {
    ok: true,
    todos: currentTodos.map((todo) =>
      todo.id === id
        ? { ...todo, status: status as AgentTodoStatus, timestamp }
        : { ...todo }
    ),
  };
}

function _nextUniqueId(
  createId: () => string,
  usedIds: ReadonlySet<string>
): string | undefined {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const candidate = createId();
    if (
      typeof candidate === "string" &&
      candidate.trim().length > 0 &&
      !usedIds.has(candidate)
    ) {
      return candidate;
    }
  }
  return undefined;
}

function _errorOutput(
  error: unknown,
  toolArguments: Record<string, unknown>,
  detailed: boolean,
  workingDirectory: string
): { output: ToolCallOutput; metadata?: AgentStatusError } {
  const normalized = _normalizeError(error);
  if (!detailed) {
    return {
      output: {
        content: [{ type: "text", text: normalized.message }],
        isError: true,
      },
    };
  }
  const metadata = _detailedError(normalized, toolArguments, workingDirectory);
  return {
    output: {
      content: [
        {
          type: "text",
          text: [
            "错误类型",
            metadata.type,
            "",
            "错误描述",
            metadata.description,
            "",
            "完整参数 JSON",
            metadata.argumentsJson,
            "",
            "调用栈",
            metadata.stack,
            "",
            "修复建议",
            ...metadata.suggestions.map((suggestion) => "- " + suggestion),
          ].join("\n"),
        },
      ],
      isError: true,
    },
    metadata,
  };
}

function _detailedError(
  error: Error & { code?: string },
  toolArguments: Record<string, unknown>,
  workingDirectory: string
): AgentStatusError {
  return {
    type: error.code ? error.name + " (" + error.code + ")" : error.name,
    description: error.message,
    argumentsJson: _safeJson(toolArguments),
    stack: error.stack ?? "无可用调用栈",
    suggestions: _errorSuggestions(error, workingDirectory),
  };
}

function _errorSuggestions(
  error: Error & { code?: string },
  workingDirectory: string
): string[] {
  if (
    error.code === "ENOENT" ||
    error.name === "FileNotFoundError" ||
    /\bENOENT\b/i.test(error.message)
  ) {
    return [
      "验证路径是否正确，并确认当前工作目录为 " + workingDirectory + "。",
      "先列出父目录内容，确认目标文件或目录确实存在。",
      "优先使用绝对路径，避免相对路径解析到错误位置。",
    ];
  }
  return [
    "核对工具参数的类型、必填字段和值域。",
    "结合调用栈定位失败位置，再选择重试或替代方案。",
  ];
}

function _normalizeError(error: unknown): Error & { code?: string } {
  if (error instanceof Error) {
    return error;
  }
  if (_isRecord(error)) {
    const normalized = new Error(
      typeof error.message === "string" ? error.message : _safeJson(error)
    ) as Error & { code?: string };
    if (typeof error.name === "string") normalized.name = error.name;
    if (typeof error.stack === "string") normalized.stack = error.stack;
    if (typeof error.code === "string") normalized.code = error.code;
    return normalized;
  }
  return new Error(String(error));
}

function _namedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

function _safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "null";
  } catch {
    return '"参数无法序列化"';
  }
}

function _isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function _cloneTodos(todos: readonly AgentTodoItem[]): AgentTodoItem[] {
  return todos.map((todo) => ({ ...todo }));
}

function _cloneError(error: AgentStatusError): AgentStatusError {
  return { ...error, suggestions: [...error.suggestions] };
}
