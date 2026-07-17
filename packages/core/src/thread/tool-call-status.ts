import type { ToolCall } from "../types";

export type ToolCallStatus = "needsResponse" | "ready" | "error";

export interface ToolCallSummary {
  totalCount: number;
  readyCount: number;
  errorCount: number;
  needsResponseCount: number;
  canContinue: boolean;
}

/**
 * Read the persisted text that will be sent back as the tool result.
 */
export function getToolCallOutputText(toolCall: ToolCall): string {
  return (
    toolCall.output?.content?.map((content) => content.text).join("\n") ?? ""
  );
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
