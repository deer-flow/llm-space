import type { AgentEvent } from "@earendil-works/pi-agent-core";

import { reduceMessages, type ReducedMessageContent } from "../client/reducer";
import type { AgentStreamRequest } from "../types/agent";
import type {
  AssistantMessage,
  Message,
  ToolCall,
  ToolCallOutput,
} from "../types/messages";
import type { ProviderConnectionRef } from "../types/models";
import type { JsonValue } from "../types/shared";
import type { SkillInfo } from "../types/skills";
import type { Thread, ThreadContext } from "../types/threads";
import {
  isDangerousBashCommand,
  isExecutableTool,
  type BuiltinTool,
  type McpTool,
  type PluginTool,
} from "../types/tools";

import {
  renderThreadPromptVariables,
  resolveThreadPromptVariableValues,
} from "./prompt-variables";
import { resolveThreadRunPolicy, type ThreadRunPolicy } from "./run-policy";

export type { ThreadRunPolicy };

export type ThreadRunPauseReason = "dangerous_bash" | "needs_manual_result";

export type ThreadRunEndReason =
  | "completed"
  | "aborted"
  | "failed"
  | "paused"
  | "max_turns";

export type ThreadRunEvent =
  | { type: "agent_event"; event: AgentEvent }
  | { type: "tool_start"; toolCallIds: string[] }
  | {
      type: "tool_result";
      toolCallId: string;
      content: ToolCallOutput["content"];
      isError: boolean;
    }
  | { type: "paused"; reason: ThreadRunPauseReason; toolCallIds: string[] }
  | {
      type: "run_end";
      reason: ThreadRunEndReason;
      policy: ThreadRunPolicy;
      messages: Message[];
      error?: string;
    };

export type ExecuteThreadTool = (
  tool: McpTool | BuiltinTool | PluginTool,
  args: Record<string, unknown>,
  context: { thread: Thread; variables: Record<string, JsonValue> }
) => Promise<{
  content: ToolCallOutput["content"];
  isError: boolean;
}>;

export type StreamThreadTurn = (
  context: ThreadContext
) => AsyncIterable<AgentEvent>;

/** Desktop RPC (or a test double) that runs the whole loop on the host. */
export type ThreadRunTransport = (
  request: AgentStreamRequest,
  options: {
    signal?: AbortSignal;
    connection?: ProviderConnectionRef;
    policy: ThreadRunPolicy;
    thread: Thread;
    onPause?: "pause" | "fail";
  }
) => AsyncIterable<ThreadRunEvent>;

export interface RunThreadLoopOptions {
  thread: Thread;
  messages: Message[];
  policy?: Partial<ThreadRunPolicy> | ThreadRunPolicy;
  signal?: AbortSignal;
  streamTurn: StreamThreadTurn;
  executeTool?: ExecuteThreadTool;
  loadSkills?: () => Promise<SkillInfo[]>;
  loadFile?: (path: string) => Promise<string>;
  fileExists?: (path: string) => Promise<boolean>;
  resolvePath?: (path: string) => Promise<string>;
  /**
   * When a dangerous bash command or non-executable tool blocks auto-run:
   * `pause` leaves the calls pending (editor), `fail` ends the run
   * (headless / no UI).
   */
  onPause?: "pause" | "fail";
}

const _noSkills = (): Promise<SkillInfo[]> => Promise.resolve([]);
const _noFile = (): Promise<string> => Promise.resolve("");
const _noFileExists = (): Promise<boolean> => Promise.resolve(false);

/**
 * Drive "model turn → optional tool execution → maybe another turn" without a
 * UI store. Callers inject one-turn streaming and tool execution.
 */
export async function* runThreadLoop(
  options: RunThreadLoopOptions
): AsyncGenerator<ThreadRunEvent> {
  const policy = resolveThreadRunPolicy(options.policy);
  const onPause = options.onPause ?? "pause";
  let messages = [...options.messages];
  let promptSnapshot = options.thread.context?.snapshot;
  let preparedContext: ThreadContext | null = {
    ...(options.thread.context ?? {}),
    messages,
    snapshot: promptSnapshot,
  };

  const isAborted = () => Boolean(options.signal?.aborted);

  try {
    for (let turn = 0; turn < policy.maxTurns; turn++) {
      if (isAborted()) {
        yield { type: "run_end", reason: "aborted", policy, messages };
        return;
      }

      const turnContext = preparedContext
        ? preparedContext
        : (
            await renderThreadPromptVariables({
              context: {
                ...(options.thread.context ?? {}),
                messages,
                snapshot: promptSnapshot,
              },
              loadSkills: options.loadSkills ?? _noSkills,
              loadFile: options.loadFile ?? _noFile,
              fileExists: options.fileExists ?? _noFileExists,
              resolvePath: options.resolvePath,
            })
          ).context;
      preparedContext = null;
      promptSnapshot = turnContext.snapshot;

      const folded = yield* _streamTurn(options.streamTurn, turnContext, () =>
        isAborted()
      );
      if (folded.status === "aborted") {
        if (folded.message) {
          messages = [...messages, folded.message];
        }
        yield { type: "run_end", reason: "aborted", policy, messages };
        return;
      }
      if (folded.status === "failed") {
        yield {
          type: "run_end",
          reason: "failed",
          policy,
          messages,
          error: folded.error,
        };
        return;
      }
      if (folded.message) {
        messages = [...messages, folded.message];
      }

      if (!policy.autoRunTools) {
        yield { type: "run_end", reason: "completed", policy, messages };
        return;
      }

      const executed = yield* _executePendingToolCalls({
        thread: options.thread,
        messages,
        signal: options.signal,
        executeTool: options.executeTool,
        loadSkills: options.loadSkills,
        loadFile: options.loadFile,
        fileExists: options.fileExists,
        resolvePath: options.resolvePath,
      });
      if (isAborted()) {
        yield { type: "run_end", reason: "aborted", policy, messages };
        return;
      }
      if (executed.status === "paused") {
        yield {
          type: "paused",
          reason: executed.reason,
          toolCallIds: executed.toolCallIds,
        };
        yield {
          type: "run_end",
          reason: onPause === "fail" ? "failed" : "paused",
          policy,
          messages,
        };
        return;
      }
      if (executed.status === "idle") {
        yield { type: "run_end", reason: "completed", policy, messages };
        return;
      }
      messages = executed.messages;
      if (!policy.reactLoop) {
        yield { type: "run_end", reason: "completed", policy, messages };
        return;
      }
    }

    yield { type: "run_end", reason: "max_turns", policy, messages };
  } catch (error) {
    if (isAborted()) {
      yield { type: "run_end", reason: "aborted", policy, messages };
      return;
    }
    yield {
      type: "run_end",
      reason: "failed",
      policy,
      messages,
      error: error instanceof Error ? error.message : "Thread run failed",
    };
  }
}

async function* _streamTurn(
  streamTurn: StreamThreadTurn,
  context: ThreadContext,
  isAborted: () => boolean
): AsyncGenerator<
  ThreadRunEvent,
  | { status: "completed"; message: AssistantMessage | null }
  | { status: "aborted"; message: AssistantMessage | null }
  | { status: "failed"; error: string }
> {
  let streamingMessage: AssistantMessage | null = null;
  let content: ReducedMessageContent[] = [];
  let committed: AssistantMessage | null = null;
  try {
    for await (const event of streamTurn(context)) {
      if (isAborted()) {
        return {
          status: "aborted",
          message: streamingMessage ?? committed,
        };
      }
      // `streamAgent()` uses a terminating no-op tool executor to stop after
      // one model turn. Its execution events and synthetic tool-result message
      // describe that adapter detail, not the real host tool run owned here.
      if (
        event.type === "tool_execution_start" ||
        event.type === "tool_execution_end" ||
        ((event.type === "message_start" || event.type === "message_end") &&
          event.message.role !== "assistant")
      ) {
        continue;
      }
      yield { type: "agent_event", event };
      const reduced = reduceMessages(event, { streamingMessage, content });
      if (!reduced) {
        continue;
      }
      if (reduced.type === "message_start" && streamingMessage) {
        committed = streamingMessage;
      }
      streamingMessage = reduced.message;
      content = reduced.content;
      if (reduced.type === "message_end") {
        committed = reduced.message;
        streamingMessage = null;
      }
    }
    return { status: "completed", message: committed ?? streamingMessage };
  } catch (error) {
    if (isAborted()) {
      return { status: "aborted", message: streamingMessage ?? committed };
    }
    return {
      status: "failed",
      error: error instanceof Error ? error.message : "Model turn failed",
    };
  }
}

async function* _executePendingToolCalls(options: {
  thread: Thread;
  messages: Message[];
  signal?: AbortSignal;
  executeTool?: ExecuteThreadTool;
  loadSkills?: () => Promise<SkillInfo[]>;
  loadFile?: (path: string) => Promise<string>;
  fileExists?: (path: string) => Promise<boolean>;
  resolvePath?: (path: string) => Promise<string>;
}): AsyncGenerator<
  ThreadRunEvent,
  | { status: "executed"; messages: Message[] }
  | { status: "idle" }
  | {
      status: "paused";
      reason: ThreadRunPauseReason;
      toolCallIds: string[];
    }
> {
  const execute = options.executeTool;
  const last = options.messages[options.messages.length - 1];
  if (last?.role !== "assistant") {
    return { status: "idle" };
  }
  const toolCalls = last.toolCalls ?? [];
  if (toolCalls.length === 0) {
    return { status: "idle" };
  }
  if (!execute) {
    return {
      status: "paused",
      reason: "needs_manual_result",
      toolCallIds: toolCalls.map((call) => call.id),
    };
  }
  const toolsByName = new Map(
    (options.thread.context?.tools ?? [])
      .filter(isExecutableTool)
      .map((tool) => [tool.name, tool])
  );
  const executable: {
    toolCall: ToolCall;
    tool: McpTool | BuiltinTool | PluginTool;
  }[] = [];
  for (const toolCall of toolCalls) {
    const tool = toolsByName.get(toolCall.input.name);
    if (!tool || !isExecutableTool(tool)) {
      return {
        status: "paused",
        reason: "needs_manual_result",
        toolCallIds: toolCalls.map((call) => call.id),
      };
    }
    if (tool.type === "builtin" && tool.name === "bash") {
      const command = (toolCall.input.arguments as { command?: unknown })
        ?.command;
      if (typeof command === "string" && isDangerousBashCommand(command)) {
        return {
          status: "paused",
          reason: "dangerous_bash",
          toolCallIds: [toolCall.id],
        };
      }
    }
    executable.push({ toolCall, tool });
  }
  if (options.signal?.aborted) {
    return { status: "idle" };
  }

  const owningThread: Thread = structuredClone({
    ...options.thread,
    context: {
      ...(options.thread.context ?? {}),
      messages: options.messages,
    },
  });
  const variables = executable.some(({ tool }) => tool.type === "plugin")
    ? await resolveThreadPromptVariableValues({
        context: owningThread.context,
        loadSkills: options.loadSkills ?? _noSkills,
        loadFile: options.loadFile ?? _noFile,
        fileExists: options.fileExists ?? _noFileExists,
        resolvePath: options.resolvePath,
      })
    : {};
  const invocationContext = { thread: owningThread, variables };
  const toolCallIds = executable.map(({ toolCall }) => toolCall.id);
  yield { type: "tool_start", toolCallIds };
  const results = await Promise.all(
    executable.map(async ({ toolCall, tool }) => {
      try {
        const { content, isError } = await execute(
          tool,
          toolCall.input.arguments,
          invocationContext
        );
        return { id: toolCall.id, content, isError };
      } catch (error) {
        const text =
          error instanceof Error ? error.message : "Tool call failed";
        return {
          id: toolCall.id,
          content: [{ type: "text" as const, text }],
          isError: true,
        };
      }
    })
  );
  if (options.signal?.aborted) {
    return { status: "idle" };
  }
  const resultById = new Map(results.map((result) => [result.id, result]));
  for (const result of results) {
    yield {
      type: "tool_result",
      toolCallId: result.id,
      content: result.content,
      isError: result.isError,
    };
  }
  const nextLast: AssistantMessage = {
    ...last,
    toolCalls: toolCalls.map((toolCall) => {
      const result = resultById.get(toolCall.id)!;
      return {
        ...toolCall,
        output: {
          content: result.content,
          isError: result.isError,
        },
      };
    }),
  };
  return {
    status: "executed",
    messages: [...options.messages.slice(0, -1), nextLast],
  };
}
