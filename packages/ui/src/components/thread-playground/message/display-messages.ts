import type { AssistantMessage, Message } from "@llm-space/core";

import type { DisplayRow, ProcessGroupSpan } from "./process-groups";
import { findProcessGroupSpans } from "./process-groups";

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

/**
 * Fold the display rows into a render sequence where completed cross-message
 * process groups collapse into a single header row (or render header-first
 * when the user expanded the group). Grouping only wraps runs that ended with
 * a result; trailing member runs — including the live streaming message —
 * always render as plain rows.
 */
export function resolveDisplayRows(
  messages: readonly Message[],
  streamingMessageId: string | null,
  running: boolean,
  options: {
    /** Master switch (setting + only while the thread is idle). */
    groupingEnabled?: boolean;
    /** Groups the user manually expanded; ids are first-member message ids. */
    expandedGroupIds?: readonly string[];
  } = {}
): DisplayRow[] {
  const base = resolveDisplayMessages(messages, streamingMessageId, running);
  if (!options.groupingEnabled) {
    return base.map((row) => ({ kind: "message" as const, ...row }));
  }
  const expanded = new Set(options.expandedGroupIds ?? []);
  const spansByStart = new Map<number, ProcessGroupSpan>(
    findProcessGroupSpans(base.map((row) => row.message)).map((span) => [
      span.start,
      span,
    ])
  );
  const rows: DisplayRow[] = [];
  let index = 0;
  while (index < base.length) {
    const span = spansByStart.get(index);
    // Never wrap a group that contains a live streaming row.
    if (
      span &&
      !base.slice(span.start, span.end).some((row) => row.streaming)
    ) {
      const collapsed = !expanded.has(span.group.id);
      rows.push({ kind: "processGroup", group: span.group, collapsed });
      if (!collapsed) {
        for (const row of base.slice(span.start, span.end)) {
          rows.push({ kind: "message", ...row });
        }
      }
      index = span.end;
      continue;
    }
    rows.push({ kind: "message", ...base[index] });
    index += 1;
  }
  return rows;
}
