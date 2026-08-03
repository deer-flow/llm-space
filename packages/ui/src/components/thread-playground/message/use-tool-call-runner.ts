import { isExecutableTool, type Tool, type ToolCall } from "@llm-space/core";
import { getToolResultText } from "@llm-space/core/thread";
import { useCallback, useMemo } from "react";

import { useHostServices } from "@llm-space/ui/host";
import { isFirecrawlLimitError } from "@llm-space/ui/lib/firecrawl";

import { useThreadStore, useThreadStoreActions } from "../stores";

export interface ToolCallOutcome {
  isError: boolean;
  isFirecrawlLimit: boolean;
}

/**
 * The single home for "call a tool and record its result". Resolves the tool by
 * name, executes it, writes the output back to the store, and classifies
 * Firecrawl-limit errors. Error *reporting* (single toast vs. bulk aggregate)
 * stays at the call site — only detection and plumbing are shared here.
 */
export function useToolCallRunner(messageId: string) {
  const { executeTool } = useHostServices();
  const tools = useThreadStore((state) => state.thread.context?.tools);
  const runtimeId = useThreadStore((state) => state.runtimeId);
  const { updateToolCallOutput, updateToolCallOutputText } =
    useThreadStoreActions();

  const toolsByName = useMemo(
    () =>
      new Map(
        (tools ?? [])
          .filter(isExecutableTool)
          .map((tool) => [tool.name, tool])
      ),
    [tools]
  );
  const resolveTool = useCallback(
    (name: string): Tool | undefined => toolsByName.get(name),
    [toolsByName]
  );

  const runToolCall = useCallback(
    async (toolCall: ToolCall): Promise<ToolCallOutcome | null> => {
      const tool = resolveTool(toolCall.input.name);
      if (!tool || !isExecutableTool(tool) || !executeTool) {
        return null;
      }
      try {
        const { content, isError } = await executeTool(
          tool,
          toolCall.input.arguments,
          { runtimeId }
        );
        updateToolCallOutput(messageId, toolCall.id, content, isError);
        const text = getToolResultText(content);
        return {
          isError,
          isFirecrawlLimit: isError && isFirecrawlLimitError(text),
        };
      } catch (error) {
        const text =
          error instanceof Error ? error.message : "Tool call failed";
        updateToolCallOutputText(messageId, toolCall.id, text, true);
        return { isError: true, isFirecrawlLimit: isFirecrawlLimitError(text) };
      }
    },
    [
      executeTool,
      messageId,
      resolveTool,
      runtimeId,
      updateToolCallOutput,
      updateToolCallOutputText,
    ]
  );

  return { resolveTool, runToolCall };
}
