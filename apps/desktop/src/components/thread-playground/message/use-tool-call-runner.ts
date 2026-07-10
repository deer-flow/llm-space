import { isExecutableTool, type Tool, type ToolCall } from "@llm-space/core";
import { useCallback, useMemo } from "react";

import { executeTool } from "@/client/tool-execution";
import { isFirecrawlLimitError } from "@/lib/firecrawl";

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
  const tools = useThreadStore((state) => state.thread.context?.tools);
  const context = useThreadStore((state) => state.thread.context);
  const { updateToolCallOutputText } = useThreadStoreActions();

  const toolsByName = useMemo(
    () => new Map((tools ?? []).map((tool) => [tool.name, tool])),
    [tools]
  );
  const resolveTool = useCallback(
    (name: string): Tool | undefined => toolsByName.get(name),
    [toolsByName]
  );

  const runToolCall = useCallback(
    async (toolCall: ToolCall): Promise<ToolCallOutcome | null> => {
      const tool = resolveTool(toolCall.input.name);
      if (!tool || !isExecutableTool(tool)) {
        return null;
      }
      try {
        const { contentText, isError } = await executeTool(
          tool,
          toolCall.input.arguments,
          context
        );
        updateToolCallOutputText(messageId, toolCall.id, contentText, isError);
        return {
          isError,
          isFirecrawlLimit: isError && isFirecrawlLimitError(contentText),
        };
      } catch (error) {
        const text =
          error instanceof Error ? error.message : "Tool call failed";
        updateToolCallOutputText(messageId, toolCall.id, text, true);
        return { isError: true, isFirecrawlLimit: isFirecrawlLimitError(text) };
      }
    },
    [context, messageId, resolveTool, updateToolCallOutputText]
  );

  return { resolveTool, runToolCall };
}
