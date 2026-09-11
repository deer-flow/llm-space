import type { Message } from "@llm-space/core";
import { useSyncExternalStore } from "react";

import {
  LOCAL_STORAGE_KEYS,
  readLocalStorage,
  writeLocalStorage,
} from "@llm-space/ui/lib/local-storage";

/**
 * Cross-message "process group" grouping, derived purely from the message
 * list. A group is a consecutive run of assistant process steps (see
 * `isProcessMessage`: tool-carrying messages, with or without commentary
 * text, plus text-free thinking/provider-hosted-activity messages) closed by
 * the run's result: an assistant message whose text answers the request. A
 * user message ends the candidate span but does NOT qualify it — steps from an
 * interrupted or abandoned run (no final answer was produced) stay expanded
 * with their failure context visible, exactly like a trailing run at the end
 * of the list.
 *
 * This is a view concept: grouping never touches the stored thread messages,
 * drag-reorder indices, or persistence.
 */
export interface ProcessGroup {
  /** Stable id: the first member message id. */
  id: string;
  /** Member messages, in display order. */
  messages: Message[];
  /** Total tool calls across all members. */
  toolCallCount: number;
  /** Name of the last tool called in the group, if any. */
  lastToolName: string | null;
  /** Tool calls across all members whose output is an error. */
  errorCount: number;
}

/** A group located in the message list: members occupy `[start, end)`. */
export interface ProcessGroupSpan {
  start: number;
  end: number;
  group: ProcessGroup;
}

function _hasTextBody(message: Message): boolean {
  return message.content.some(
    (content) => content.type === "text" && content.text.length > 0
  );
}

/**
 * Whether the message is a "process" step of a run.
 *
 * Real provider traffic puts running commentary ("Let me check…") on the same
 * assistant message as its tool calls, so a client-side tool call marks the
 * whole message as process: the auto-run loop always continues after tool
 * calls, so that text is never the run's result. Without tool calls, a
 * message only counts as process when it has no text body at all (pure
 * thinking, or provider-hosted activities) — an assistant message whose text
 * is the answer, including the provider-hosted "activities + answer" shape,
 * stays a result.
 */
export function isProcessMessage(message: Message): boolean {
  if (message.role !== "assistant") {
    return false;
  }
  if ((message.toolCalls?.length ?? 0) > 0) {
    return true;
  }
  if (_hasTextBody(message)) {
    return false;
  }
  return (
    Boolean(message.thinking) ||
    (message.providerHostedToolActivities?.length ?? 0) > 0
  );
}

function _summarizeGroup(
  messages: Message[],
  start: number,
  end: number
): ProcessGroup {
  const members = messages.slice(start, end);
  let toolCallCount = 0;
  let errorCount = 0;
  let lastToolName: string | null = null;
  for (const message of members) {
    if (message.role !== "assistant") continue;
    for (const toolCall of message.toolCalls ?? []) {
      toolCallCount += 1;
      if (toolCall.output?.isError) {
        errorCount += 1;
      }
      lastToolName = toolCall.input.name;
    }
  }
  return {
    id: members[0].id,
    messages: members,
    toolCallCount,
    lastToolName,
    errorCount,
  };
}

/**
 * Find every groupable run of process messages. A run is only returned when
 * it is closed by the run's result — an assistant message with a text body.
 * Anything else (a user message, an empty assistant message) ends the
 * candidate span without grouping it, and runs reaching the end of the list
 * stay ungrouped.
 */
export function findProcessGroupSpans(
  messages: readonly Message[]
): ProcessGroupSpan[] {
  const spans: ProcessGroupSpan[] = [];
  let start = -1;
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (isProcessMessage(message)) {
      if (start === -1) {
        start = index;
      }
      continue;
    }
    if (start === -1) {
      continue;
    }
    // A non-member message closes the run. Only a result (assistant text)
    // makes it eligible to collapse; a user message following unfinished
    // steps keeps those steps expanded as failure context.
    const isResult = message.role === "assistant" && _hasTextBody(message);
    if (isResult) {
      spans.push({
        start,
        end: index,
        group: _summarizeGroup([...messages], start, index),
      });
    }
    start = -1;
  }
  return spans;
}

// --- Display rows -----------------------------------------------------------

export type DisplayRow =
  | { kind: "message"; message: Message; streaming: boolean }
  | { kind: "processGroup"; group: ProcessGroup; collapsed: boolean };

/**
 * The collapsed group hiding `messageId`, if any. Used to reveal a group
 * before scrolling to (or focusing) a target inside it — autofocus and
 * run-validation targets must never stay unmounted behind their header row.
 */
export function findCollapsedGroupIdForMessage(
  rows: readonly DisplayRow[],
  messageId: string
): string | null {
  for (const row of rows) {
    if (
      row.kind === "processGroup" &&
      row.collapsed &&
      row.group.messages.some((message) => message.id === messageId)
    ) {
      return row.group.id;
    }
  }
  return null;
}

// --- User preference --------------------------------------------------------

const listeners = new Set<() => void>();

/**
 * Whether cross-message process groups should collapse once their run
 * finishes. Defaults to on ("result first"); persisted app-wide.
 */
export function getCollapseProcessGroups(): boolean {
  return readLocalStorage(LOCAL_STORAGE_KEYS.collapseProcessGroups) !== "false";
}

export function setCollapseProcessGroups(value: boolean): void {
  writeLocalStorage(
    LOCAL_STORAGE_KEYS.collapseProcessGroups,
    value ? "true" : "false"
  );
  for (const listener of listeners) {
    listener();
  }
}

function _subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCollapseProcessGroups(): boolean {
  return useSyncExternalStore(_subscribe, getCollapseProcessGroups, () => true);
}
