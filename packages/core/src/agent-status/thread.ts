import type { Thread, ThreadContext } from "../types/threads";
import type { Tool } from "../types/tools";

import {
  AGENT_STATUS_TODO_TOOLS,
  isAgentStatusTodoTool,
  isAgentStatusTodoToolName,
} from "./tools";
import {
  ALL_AGENT_STATUS_COMPONENTS,
  type AgentStatusComponent,
  type AgentStatusSettings,
} from "./types";

export interface NormalizedAgentStatusSettings {
  components: AgentStatusComponent[];
  simulatedTimeOffsetMs: number;
}

/**
 * 规范化组件顺序、去重，并拒绝无效的时间模拟偏移。
 */
export function normalizeAgentStatusSettings(
  settings: AgentStatusSettings | undefined
): NormalizedAgentStatusSettings {
  const enabled = new Set(settings?.components ?? []);
  const offset = settings?.simulatedTimeOffsetMs;
  const components = ALL_AGENT_STATUS_COMPONENTS.filter((component) =>
    enabled.has(component)
  );
  return {
    components,
    simulatedTimeOffsetMs:
      components.includes("timestamps") &&
      typeof offset === "number" &&
      Number.isFinite(offset)
        ? offset
        : 0,
  };
}

/**
 * 原子应用 Agent Status 配置，并同步该功能拥有的 TODO 工具。
 */
export function applyAgentStatusConfiguration(
  thread: Thread,
  settings: AgentStatusSettings
): Thread {
  const context = thread.context ?? {};
  const normalizedSettings = normalizeAgentStatusSettings(settings);
  const tools = _normalizeTodoTools(
    context.tools,
    normalizedSettings.components.includes("todos")
  );

  if (
    thread.context &&
    _sameSettings(context.agentStatus, normalizedSettings) &&
    tools === context.tools
  ) {
    return thread;
  }
  return {
    ...thread,
    context: {
      ...context,
      agentStatus: normalizedSettings,
      ...(tools === undefined ? {} : { tools }),
    },
  };
}

/**
 * 规范已有配置；完全未配置时只清理残留的功能 TODO 工具。
 */
export function normalizeAgentStatusThread(thread: Thread): Thread {
  const context = thread.context;
  if (!context) {
    return thread;
  }
  if (context.agentStatus) {
    return applyAgentStatusConfiguration(thread, context.agentStatus);
  }

  const tools = _normalizeTodoTools(context.tools, false);
  if (tools === context.tools) {
    return thread;
  }
  return {
    ...thread,
    context: {
      ...context,
      ...(tools === undefined ? {} : { tools }),
    },
  };
}

/**
 * 为旧 user 消息补一次稳定观测时间；已有时间戳永远保持不变。
 */
export function backfillAgentStatusUserTimestamps(
  thread: Thread,
  observeTime: () => number
): Thread {
  if (
    !normalizeAgentStatusSettings(
      thread.context?.agentStatus
    ).components.includes("timestamps")
  ) {
    return thread;
  }
  const messages = thread.context?.messages;
  if (!messages) {
    return thread;
  }

  let changed = false;
  let observedAt: number | undefined;
  const nextMessages = messages.map((message) => {
    if (
      message.role !== "user" ||
      message.agentStatus?.timestamp !== undefined
    ) {
      return message;
    }
    changed = true;
    observedAt ??= observeTime();
    return {
      ...message,
      agentStatus: {
        ...message.agentStatus,
        timestamp: observedAt,
      },
    };
  });

  if (!changed) {
    return thread;
  }
  return {
    ...thread,
    context: {
      ...thread.context,
      messages: nextMessages,
    },
  };
}

/**
 * 解析 Agent Status 使用的工作目录；宿主已解析值优先于持久化原值。
 */
export function resolveAgentStatusWorkingDirectory(
  context: ThreadContext | undefined,
  resolvedVariables?: Readonly<Record<string, unknown>>
): string | undefined {
  const variables = context?.variables ?? {};
  const namedResolved = _nonEmptyString(
    resolvedVariables?.current_working_directory
  );
  if (namedResolved !== undefined) {
    return namedResolved;
  }

  const named = variables.current_working_directory;
  if (named?.type === "workingDirectory" && _isNonEmpty(named.value)) {
    return named.value;
  }

  for (const [name, variable] of Object.entries(variables)) {
    if (
      name === "current_working_directory" ||
      variable.type !== "workingDirectory"
    ) {
      continue;
    }
    const resolved = _nonEmptyString(resolvedVariables?.[name]);
    if (resolved !== undefined) {
      return resolved;
    }
  }

  for (const [name, variable] of Object.entries(variables)) {
    if (
      name !== "current_working_directory" &&
      variable.type === "workingDirectory" &&
      _isNonEmpty(variable.value)
    ) {
      return variable.value;
    }
  }
  return undefined;
}

function _normalizeTodoTools(
  tools: Tool[] | undefined,
  enabled: boolean
): Tool[] | undefined {
  const withoutTodoTools = (tools ?? []).filter(
    (tool) =>
      !isAgentStatusTodoTool(tool) &&
      (!enabled || !("name" in tool) || !isAgentStatusTodoToolName(tool.name))
  );
  const normalized = enabled
    ? [...withoutTodoTools, ...AGENT_STATUS_TODO_TOOLS]
    : withoutTodoTools;

  if (_sameItems(tools, normalized)) {
    return tools;
  }
  if (!enabled && tools === undefined && normalized.length === 0) {
    return undefined;
  }
  return normalized;
}

function _sameItems(
  current: readonly Tool[] | undefined,
  normalized: readonly Tool[]
): boolean {
  return (
    current?.length === normalized.length &&
    current.every((tool, index) => tool === normalized[index])
  );
}

function _sameSettings(
  current: AgentStatusSettings | undefined,
  normalized: NormalizedAgentStatusSettings
): boolean {
  return (
    current?.simulatedTimeOffsetMs === normalized.simulatedTimeOffsetMs &&
    current.components?.length === normalized.components.length &&
    current.components.every(
      (component, index) => component === normalized.components[index]
    )
  );
}

function _nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && _isNonEmpty(value) ? value : undefined;
}

function _isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}
