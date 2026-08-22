import type * as pi from "@earendil-works/pi-ai";

import { resolveAgentStatusWorkingDirectory } from "../agent-status/thread";
import type { PiAgentStatusContext } from "../agent-status/types";
import type { PiThreadContext } from "../types/agent";
import type { Message, ModelUsage } from "../types/messages";
import type { ThreadContext } from "../types/threads";
import {
  isProviderHostedTool,
  type ProviderHostedTool,
  type Tool,
} from "../types/tools";

export function convertToPiContext(context: ThreadContext): PiThreadContext {
  const tools = context.tools ?? [];
  const providerHostedTools = tools.filter(isProviderHostedTool);
  const agentStatus = _convertAgentStatus(context);
  const result: PiThreadContext = {
    systemPrompt: context.systemPrompt,
    messages: context.messages ? _convertToPiMessages(context.messages) : [],
    tools: _convertToPiTools(
      tools.filter(
        (tool): tool is Exclude<Tool, ProviderHostedTool> =>
          !isProviderHostedTool(tool)
      )
    ),
    responseApiNativeTools: providerHostedTools.map((tool) => ({
      ...tool.config,
    })),
    ...(agentStatus ? { agentStatus } : {}),
  };
  return result;
}

function _convertToPiMessages(messages: Message[]) {
  const result: pi.Message[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      const piMessage: pi.UserMessage = {
        role: "user",
        content: _convertMessageContents(message) as (
          pi.TextContent | pi.ImageContent
        )[],
        timestamp: message.agentStatus?.timestamp ?? 0,
      };
      result.push(piMessage);
    } else if (message.role === "assistant") {
      const piMessage: pi.AssistantMessage = {
        role: "assistant",
        content: _convertMessageContents(message) as (
          pi.TextContent | pi.ThinkingContent | pi.ToolCall
        )[],
        api: "",
        model: "",
        provider: "",
        stopReason: "stop",
        timestamp: 0,
        usage: _convertUsage(message.usage),
        ...(message.providerHostedToolActivities
          ? { nativeToolActivities: message.providerHostedToolActivities }
          : {}),
        ...(message.responseOutputItems
          ? { responseOutputItems: message.responseOutputItems }
          : {}),
      };
      result.push(piMessage);
    }
    if (message.role === "assistant" && message.toolCalls) {
      for (const toolCall of message.toolCalls) {
        result.push({
          role: "toolResult",
          toolCallId: toolCall.id,
          toolName: toolCall.input.name,
          content: toolCall.output?.content ?? [{ type: "text", text: "" }],
          isError: toolCall.output?.isError ?? false,
          timestamp: toolCall.output?.agentStatus?.timestamp ?? 0,
        });
      }
    }
  }
  return result;
}

function _convertAgentStatus(
  context: ThreadContext
): PiAgentStatusContext | undefined {
  const workingDirectory = resolveAgentStatusWorkingDirectory(context);
  const toolCallMetadata = Object.create(null) as NonNullable<
    PiAgentStatusContext["toolCallMetadata"]
  >;
  for (const message of context.messages ?? []) {
    if (message.role !== "assistant") continue;
    for (const toolCall of message.toolCalls ?? []) {
      if (toolCall.output?.agentStatus) {
        toolCallMetadata[toolCall.id] = toolCall.output.agentStatus;
      }
    }
  }

  const sidecar: PiAgentStatusContext = {
    ...(context.agentStatus?.components
      ? { components: [...context.agentStatus.components] }
      : {}),
    ...(context.agentStatus?.simulatedTimeOffsetMs === undefined
      ? {}
      : {
          simulatedTimeOffsetMs: context.agentStatus.simulatedTimeOffsetMs,
        }),
    ...(workingDirectory ? { workingDirectory } : {}),
    ...(Object.keys(toolCallMetadata).length > 0 ? { toolCallMetadata } : {}),
  };
  return Object.keys(sidecar).length > 0 ? sidecar : undefined;
}

/** Preserve provider usage when replaying saved assistant messages to pi. */
function _convertUsage(messageUsage: ModelUsage | undefined): pi.Usage {
  return (
    messageUsage ?? {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    }
  );
}

function _convertMessageContents(
  message: Message
): (pi.TextContent | pi.ImageContent | pi.ThinkingContent | pi.ToolCall)[] {
  if (message.role === "user") {
    return message.content;
  } else if (message.role === "assistant") {
    const contents: (
      pi.TextContent | pi.ImageContent | pi.ThinkingContent | pi.ToolCall
    )[] = [];
    if (message.thinking) {
      contents.push({
        type: "thinking",
        thinking: message.thinking,
      } satisfies pi.ThinkingContent);
    }
    for (const content of message.content) {
      if (content.type === "text") {
        contents.push({ ...content } satisfies pi.TextContent);
      } else if (content.type === "image") {
        // Assistant messages may not carry images; drop them on conversion.
        continue;
      } else {
        throw new Error(`Unsupported content type: ${JSON.stringify(content)}`);
      }
    }
    for (const toolCall of message.toolCalls ?? []) {
      contents.push({
        type: "toolCall",
        id: toolCall.id,
        name: toolCall.input.name,
        arguments: toolCall.input.arguments,
      } satisfies pi.ToolCall);
    }
    return contents;
  } else {
    throw new Error(`Unsupported message role: ${JSON.stringify(message)}`);
  }
}

function _convertToPiTools(
  tools: Exclude<Tool, ProviderHostedTool>[]
): pi.Tool[] {
  if (!tools) {
    return [];
  }
  return tools.map((tool) => {
    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    };
  });
}
