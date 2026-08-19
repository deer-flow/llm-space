import type { AssistantMessage, Message } from "@llm-space/core";

export interface DisplayMessage {
  message: Message;
  streaming: boolean;
}

function _emptyStreamingMessage(id: string): AssistantMessage {
  return { id, role: "assistant", content: [] };
}

/**
 * Keep the live assistant turn inside the same virtualized sequence that will
 * own it after commit. Matching ids are deliberately folded into one row so
 * the virtualizer retains its measured height across the terminal transition.
 */
export function resolveDisplayMessages(
  messages: readonly Message[],
  streamingMessageId: string | null,
  running: boolean
): DisplayMessage[] {
  const rows = messages.map((message) => ({ message, streaming: false }));
  const previewId =
    streamingMessageId ??
    (running && messages.at(-1)?.role !== "assistant"
      ? "streaming"
      : null);
  if (!previewId) return rows;

  const committedIndex = messages.findIndex(
    (message) => message.id === previewId
  );
  if (committedIndex >= 0) {
    rows[committedIndex] = {
      message: messages[committedIndex],
      streaming: true,
    };
    return rows;
  }
  rows.push({
    message: _emptyStreamingMessage(previewId),
    streaming: true,
  });
  return rows;
}
