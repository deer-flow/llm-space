import type { Message } from "../types/messages";

/** Error for starting a run on a conversation that cannot accept one. */
export const RUN_LAST_MESSAGE_ERROR =
  "The last message must be a user message or a tool call result.";

/**
 * Whether a conversation can start a run: it must be empty or end with a user
 * message or a tool call result. An assistant message with tool calls converts
 * into trailing `toolResult` messages (see `convertToPiContext`), so it
 * qualifies; a plain assistant message does not.
 */
export function isRunnableConversation(
  messages: Message[] | undefined
): boolean {
  const last = messages?.[messages.length - 1];
  if (!last || last.role === "user") {
    return true;
  }
  return (last.toolCalls?.length ?? 0) > 0;
}
