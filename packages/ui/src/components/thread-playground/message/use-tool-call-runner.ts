import { isExecutableTool, type Tool, type ToolCall } from "@llm-space/core";
import {
  getToolResultText,
  resolveThreadPromptVariableValues,
} from "@llm-space/core/thread";
import { useCallback, useMemo } from "react";

import { useHostServices } from "@llm-space/ui/host";
import { isFirecrawlLimitError } from "@llm-space/ui/lib/firecrawl";

import { createRuntimePromptFiles } from "../runtime-prompt-files";
import { useThreadStore, useThreadStoreActions } from "../stores";
import { useToolExecutor } from "../tool/use-tool-executor";
import { listEnabledPromptVariableSkills } from "../variable/prompt-variable-skills";

import {
  findMessageScrollTarget,
  preserveScrollOffsetAfterLayout,
} from "./message-scroll-stability";

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
  const { files, skills } = useHostServices();
  const tools = useThreadStore((state) => state.thread.context?.tools);
  const thread = useThreadStore((state) => state.thread);
  const runtimeId = useThreadStore((state) => state.runtimeId);
  const executeTool = useToolExecutor(runtimeId);
  const ownerRuntimeId = runtimeId ?? "local";
  const { updateToolCallOutput, updateToolCallOutputText } =
    useThreadStoreActions();

  const toolsByName = useMemo(
    () =>
      new Map(
        (tools ?? []).filter(isExecutableTool).map((tool) => [tool.name, tool])
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
        const owningThread = structuredClone(thread);
        const promptFiles = createRuntimePromptFiles(files, ownerRuntimeId);
        const variables =
          tool.type === "plugin"
            ? await resolveThreadPromptVariableValues({
                context: owningThread.context,
                loadSkills: () =>
                  listEnabledPromptVariableSkills(skills, {
                    runtimeId: ownerRuntimeId,
                  }),
                loadFile: promptFiles.loadFile,
                fileExists: promptFiles.fileExists,
              })
            : {};
        const { content, isError } = await executeTool(
          tool,
          toolCall.input.arguments,
          { thread: owningThread, variables }
        );
        preserveScrollOffsetAfterLayout(
          findMessageScrollTarget(messageId),
          () => updateToolCallOutput(messageId, toolCall.id, content, isError)
        );
        const text = getToolResultText(content);
        return {
          isError,
          isFirecrawlLimit: isError && isFirecrawlLimitError(text),
        };
      } catch (error) {
        const text =
          error instanceof Error ? error.message : "Tool call failed";
        preserveScrollOffsetAfterLayout(
          findMessageScrollTarget(messageId),
          () => updateToolCallOutputText(messageId, toolCall.id, text, true)
        );
        return { isError: true, isFirecrawlLimit: isFirecrawlLimitError(text) };
      }
    },
    [
      executeTool,
      files,
      messageId,
      resolveTool,
      ownerRuntimeId,
      skills,
      thread,
      updateToolCallOutput,
      updateToolCallOutputText,
    ]
  );

  return { resolveTool, runToolCall };
}
