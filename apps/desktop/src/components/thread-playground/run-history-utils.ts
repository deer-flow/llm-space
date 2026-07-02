import {
  getMessageText,
  type AssistantMessage,
  type Message,
  type ThreadSnapshot,
} from "@llm-space/core";

/**
 * A short summary of a run's resulting thread, derived from its last message.
 */
export function summarizeRun(thread: ThreadSnapshot): string {
  const messages = thread.context?.messages ?? [];
  const last = messages[messages.length - 1];
  if (!last) {
    return thread.context?.systemPrompt?.trim() || "Empty thread";
  }
  if (last.role === "assistant" && last.toolCalls?.length) {
    return last.toolCalls
      .map((toolCall) => `${toolCall.input.name}()`)
      .join(", ");
  }
  const imageCount = last.content.filter((c) => c.type === "image_data").length;
  if (imageCount > 0) {
    return `[${imageCount} image${imageCount > 1 ? "s" : ""}]`;
  }
  const text = getMessageText(last).trim();
  return text || "Empty message";
}

/** The model label for a run snapshot, separated so it can truncate safely. */
export function runModelLabel(thread: ThreadSnapshot): string {
  return thread.model
    ? `${thread.model.provider}/${thread.model.id}`
    : "No model";
}

/** The message count label for a run snapshot, kept visible in narrow panels. */
export function runMessageCountLabel(thread: ThreadSnapshot): string {
  const messageCount = thread.context?.messages?.length ?? 0;
  return `${messageCount} message${messageCount === 1 ? "" : "s"}`;
}

/** Return the last message for a given role in a snapshot. */
function _lastMessageByRole<T extends Message["role"]>(
  thread: ThreadSnapshot,
  role: T
): Extract<Message, { role: T }> | null {
  const messages = thread.context?.messages ?? [];
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.role === role) {
      return message as Extract<Message, { role: T }>;
    }
  }
  return null;
}

/** The final user input that led to a run result. */
export function runLastUserText(thread: ThreadSnapshot): string {
  const message = _lastMessageByRole(thread, "user");
  if (!message) {
    return "No user message";
  }
  const text = getMessageText(message).trim();
  const imageCount = message.content.filter((c) => c.type === "image_data")
    .length;
  if (text && imageCount > 0) {
    return `${text}\n[${imageCount} image${imageCount > 1 ? "s" : ""}]`;
  }
  if (text) {
    return text;
  }
  return imageCount > 0
    ? `[${imageCount} image${imageCount === 1 ? "" : "s"}]`
    : "Empty user message";
}

/** The assistant or tool result a user is most likely comparing. */
export function runResultText(thread: ThreadSnapshot): string {
  const message = _lastMessageByRole(thread, "assistant");
  if (!message) {
    return "No assistant result";
  }
  const toolText = _toolResultText(message);
  const assistantText = getMessageText(message).trim();
  return [assistantText, toolText].filter(Boolean).join("\n\n") || "Empty result";
}

/** Compactly format tool calls and outputs inside an assistant result. */
function _toolResultText(message: AssistantMessage): string {
  if (!message.toolCalls?.length) {
    return "";
  }
  return message.toolCalls
    .map((toolCall) => {
      const output = toolCall.output?.content
        ?.map((content) => content.text)
        .join("\n")
        .trim();
      const args = JSON.stringify(toolCall.input.arguments);
      return output
        ? `${toolCall.input.name}(${args})\n${output}`
        : `${toolCall.input.name}(${args})`;
    })
    .join("\n\n");
}
