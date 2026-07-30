import type { ToolCall, ToolCallOutput } from "../types";

export type ToolCallStatus = "needsResponse" | "ready" | "error";

export interface ToolCallSummary {
  totalCount: number;
  readyCount: number;
  errorCount: number;
  needsResponseCount: number;
  canContinue: boolean;
}

/** Join the text parts of structured tool output; image parts stay untouched. */
export function getToolResultText(
  content: ToolCallOutput["content"] | undefined
): string {
  return (
    content
      ?.filter((content) => content.type === "text")
      .map((content) => content.text)
      .join("\n") ?? ""
  );
}

/** Read the persisted text that will be sent back as the tool result. */
export function getToolCallOutputText(toolCall: ToolCall): string {
  return getToolResultText(toolCall.output?.content);
}

/**
 * Derive the user-facing state from existing thread data; no extra schema.
 */
export function getToolCallStatus(toolCall: ToolCall): ToolCallStatus {
  return toolCall.output?.isError ? "error" : "ready";
}

/**
 * Summarize whether an assistant tool-call message is ready to continue.
 */
export function summarizeToolCalls(toolCalls: ToolCall[]): ToolCallSummary {
  let readyCount = 0;
  let errorCount = 0;
  let needsResponseCount = 0;

  for (const toolCall of toolCalls) {
    const status = getToolCallStatus(toolCall);
    if (status === "ready") {
      readyCount += 1;
    } else if (status === "error") {
      errorCount += 1;
    } else {
      needsResponseCount += 1;
    }
  }

  return {
    totalCount: toolCalls.length,
    readyCount,
    errorCount,
    needsResponseCount,
    canContinue: toolCalls.length > 0 && needsResponseCount === 0,
  };
}
