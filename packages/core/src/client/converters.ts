import type * as pi from "@earendil-works/pi-ai";

import type { Message } from "../types/messages";
import type { ThreadContext } from "../types/threads";
import type { Tool } from "../types/tools";

export function convertToPiContext(
  context: ThreadContext,
  model: pi.Model<pi.Api>
) {
  const result = {
    systemPrompt: context.systemPrompt,
    messages: context.messages
      ? _convertToPiMessages(context.messages, model)
      : [],
    tools: context.tools ? _convertToPiTools(context.tools) : [],
  };
  return result;
}

function _convertToPiMessages(messages: Message[], model: pi.Model<pi.Api>) {
  const result: pi.Message[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      const piMessage: pi.UserMessage = {
        role: "user",
        content: _convertMessageContents(message) as (
          | pi.TextContent
          | pi.ImageContent
        )[],
        timestamp: Date.now(),
      };
      result.push(piMessage);
    } else if (message.role === "assistant") {
      const piMessage: pi.AssistantMessage = {
        role: "assistant",
        content: _convertMessageContents(message) as (
          | pi.TextContent
          | pi.ThinkingContent
          | pi.ToolCall
        )[],
        api: model.api,
        model: model.id,
        provider: model.provider,
        stopReason: "stop",
        timestamp: Date.now(),
        usage: {
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
        },
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
          isError: false,
          timestamp: Date.now(),
        });
      }
    }
  }
  return result;
}

function _convertMessageContents(
  message: Message
): (pi.TextContent | pi.ImageContent | pi.ThinkingContent | pi.ToolCall)[] {
  if (message.role === "user") {
    return message.content.map((content) => {
      if (content.type === "text") {
        return { ...content } satisfies pi.TextContent;
      } else if (content.type === "image_data") {
        return {
          type: "image",
          mimeType: content.mimeType,
          data: content.data,
        } satisfies pi.ImageContent;
      } else {
        throw new Error(`Unsupported content type: ${JSON.stringify(content)}`);
      }
    });
  } else if (message.role === "assistant") {
    const contents: (
      | pi.TextContent
      | pi.ImageContent
      | pi.ThinkingContent
      | pi.ToolCall
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

function _convertToPiTools(tools: Tool[]): pi.Tool[] {
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
