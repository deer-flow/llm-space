import { getMessageText, type Message } from "@llm-space/core";

/** Build the compact text shown by a message navigator anchor. */
export function messagePreview(message: Message): string {
  const text = getMessageText(message).replace(/\s+/g, " ").trim();
  if (text) return text;

  const imageCount = message.content.filter(
    (content) => content.type === "image"
  ).length;
  if (imageCount > 0) {
    return `${imageCount} image attachment${imageCount === 1 ? "" : "s"}`;
  }
  if (message.role === "assistant" && message.toolCalls?.length) {
    return message.toolCalls
      .map((toolCall) => `${toolCall.input.name}()`)
      .join(", ");
  }
  if (
    message.role === "assistant" &&
    message.providerHostedToolActivities?.length
  ) {
    return message.providerHostedToolActivities
      .map((activity) => activity.type)
      .join(", ");
  }
  if (message.role === "assistant" && message.thinking?.trim()) {
    return message.thinking.replace(/\s+/g, " ").trim();
  }
  return "Empty message";
}
