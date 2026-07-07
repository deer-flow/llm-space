import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type {
  TextContent,
  ToolCall,
  ThinkingContent,
  Usage as PiUsage,
} from "@earendil-works/pi-ai";

import type {
  AssistantMessage,
  ModelUsage,
  ToolCallOutput,
} from "../types/messages";
import { parseJSON, uuid } from "../utils";

export type ToolCallContent = Omit<ToolCall, "arguments"> & {
  arguments: string;
};
export type ReducedMessageContent =
  ThinkingContent | TextContent | ToolCallContent;

interface ReduceResult {
  type: "message_start" | "message_update" | "message_end";
  message: AssistantMessage;
  content: ReducedMessageContent[];
}

type AssistantMessageEvent = Extract<
  AgentEvent,
  { type: "message_update" }
>["assistantMessageEvent"];

type AssistantToolCall = NonNullable<AssistantMessage["toolCalls"]>[number];

export function reduceMessages(
  event: AgentEvent,
  {
    streamingMessage = null,
    content = [],
  }: {
    streamingMessage?: AssistantMessage | null;
    content?: ReducedMessageContent[];
  }
): ReduceResult | null {
  switch (event.type) {
    case "message_start":
      if (event.message.role !== "assistant") {
        return null;
      }
      return {
        type: "message_start",
        message: { id: uuid(), role: "assistant", content: [] },
        content: [],
      };
    case "message_update":
      return _reduceAssistantMessageEvent(
        event.assistantMessageEvent,
        streamingMessage,
        content
      );
    case "message_end": {
      const message = streamingMessage!;
      const usage = _normalizeUsage(
        event.message.role === "assistant" ? event.message.usage : undefined
      );
      const finalMessage =
        message.content.length === 0
          ? { ...message, content: [{ type: "text" as const, text: "" }] }
          : message;
      return {
        type: "message_end",
        message: usage ? { ...finalMessage, usage } : finalMessage,
        content: [],
      };
    }
    case "tool_execution_end":
      return _createUpdateMessageEvent(
        _replaceToolCall(streamingMessage!, event.toolCallId, (toolCall) => ({
          ...toolCall,
          output: event.result as ToolCallOutput,
        })),
        []
      );
    case "agent_end":
      for (const message of event.messages) {
        if (message.role === "assistant" && message.errorMessage) {
          throw new Error(message.errorMessage);
        }
      }
      return null;
    default:
      // tool_execution_start and any other event types are ignored.
      return null;
  }
}

/**
 * Copy provider usage into LLM Space's persisted shape.
 *
 * Boundaries: keep only non-negative finite numbers, omit noisy all-zero usage,
 * and store the provider's total-token value when it exists. Provider-specific
 * splits such as Anthropic's 1h cache-write retention stay out of the thread
 * schema; the product exposes the portable read/write/cache/reasoning/cost
 * totals that users can compare across providers.
 */
function _normalizeUsage(usage: PiUsage | undefined): ModelUsage | undefined {
  if (!usage) {
    return undefined;
  }
  const input = _finiteUsageNumber(usage.input);
  const output = _finiteUsageNumber(usage.output);
  const cacheRead = _finiteUsageNumber(usage.cacheRead);
  const cacheWrite = _finiteUsageNumber(usage.cacheWrite);
  const reasoning = _optionalUsageNumber(usage.reasoning);
  const totalTokens = _finiteUsageNumber(
    usage.totalTokens || input + output + cacheRead + cacheWrite
  );
  const cost = {
    input: _finiteUsageNumber(usage.cost?.input),
    output: _finiteUsageNumber(usage.cost?.output),
    cacheRead: _finiteUsageNumber(usage.cost?.cacheRead),
    cacheWrite: _finiteUsageNumber(usage.cost?.cacheWrite),
    total: _finiteUsageNumber(usage.cost?.total),
  };
  const hasTokenUsage =
    totalTokens > 0 ||
    input > 0 ||
    output > 0 ||
    cacheRead > 0 ||
    cacheWrite > 0 ||
    (reasoning ?? 0) > 0;
  const hasCostUsage =
    cost.input > 0 ||
    cost.output > 0 ||
    cost.cacheRead > 0 ||
    cost.cacheWrite > 0 ||
    cost.total > 0;
  if (!hasTokenUsage && !hasCostUsage) {
    return undefined;
  }
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    ...(reasoning === undefined ? {} : { reasoning }),
    totalTokens,
    cost,
  };
}

function _finiteUsageNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function _optionalUsageNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : undefined;
}

/** Build a `message_update` result. */
function _createUpdateMessageEvent(
  message: AssistantMessage,
  content: ReducedMessageContent[]
): ReduceResult {
  return { type: "message_update", message, content };
}

/** Replace the tool call with the given id, leaving the others untouched. */
function _replaceToolCall(
  message: AssistantMessage,
  toolCallId: string,
  updater: (toolCall: AssistantToolCall) => AssistantToolCall
): AssistantMessage {
  return {
    ...message,
    toolCalls: message.toolCalls?.map((toolCall) =>
      toolCall.id === toolCallId ? updater(toolCall) : toolCall
    ),
  };
}

function _reduceAssistantMessageEvent(
  event: AssistantMessageEvent,
  streamingMessage: AssistantMessage | null,
  content: ReducedMessageContent[]
): ReduceResult | null {
  const message = streamingMessage!;
  switch (event.type) {
    case "thinking_start": {
      content[event.contentIndex] = { type: "thinking", thinking: "" };
      return _createUpdateMessageEvent({ ...message, thinking: "" }, content);
    }
    case "thinking_delta": {
      const thinkingContent = content[event.contentIndex] as ThinkingContent;
      thinkingContent.thinking += event.delta;
      return _createUpdateMessageEvent(
        { ...message, thinking: thinkingContent.thinking },
        content
      );
    }
    case "text_start": {
      const textContent: TextContent = { type: "text", text: "" };
      content[event.contentIndex] = textContent;
      return _createUpdateMessageEvent(
        { ...message, content: [textContent] },
        content
      );
    }
    case "text_delta": {
      const textContent = content[event.contentIndex] as TextContent;
      textContent.text += event.delta;
      return _createUpdateMessageEvent(
        {
          ...message,
          content: message.content.map((c) =>
            c.type === "text" ? { ...textContent } : c
          ),
        },
        content
      );
    }
    case "toolcall_start": {
      const toolCallContent: ToolCallContent = {
        ...(event.partial.content[
          event.contentIndex
        ] as unknown as ToolCallContent),
        arguments: "",
      };
      content[event.contentIndex] = toolCallContent;
      return _createUpdateMessageEvent(
        {
          ...message,
          toolCalls: [
            ...(message.toolCalls ?? []),
            {
              id: toolCallContent.id,
              input: {
                name: toolCallContent.name,
                arguments: {},
                partialArguments: "",
              },
            },
          ],
        },
        content
      );
    }
    case "toolcall_delta": {
      const toolCallContent = content[event.contentIndex] as ToolCallContent;
      toolCallContent.arguments += event.delta;
      let args: Record<string, unknown> = {};
      try {
        args = parseJSON<Record<string, unknown>>(toolCallContent.arguments);
      } catch {
        return _createUpdateMessageEvent(message, content);
      }
      return _createUpdateMessageEvent(
        _replaceToolCall(message, toolCallContent.id, (toolCall) => ({
          ...toolCall,
          input: {
            ...toolCall.input,
            arguments: args,
            partialArguments: undefined,
          },
        })),
        content
      );
    }
    case "toolcall_end": {
      return _createUpdateMessageEvent(
        _replaceToolCall(message, event.toolCall.id, (toolCall) => ({
          ...toolCall,
          output: { content: [{ type: "text", text: "" }] },
        })),
        content
      );
    }
    default:
      return null;
  }
}
