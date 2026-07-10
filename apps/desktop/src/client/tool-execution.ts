import type {
  BuiltinTool,
  McpTool,
  PluginTool,
  ThreadContext,
} from "@llm-space/core";

import { callBuiltInTool } from "@/client/built-in-tools";
import { callMcpTool } from "@/client/mcp";
import { callPluginTool } from "@/client/plugins";

/**
 * A tool call's result, normalized across the executable backends. MCP and
 * plugins surface `isError` on the response; built-in tools signal failure by
 * throwing, so a successful built-in result is always `isError: false`.
 */
export interface ToolCallResult {
  contentText: string;
  isError: boolean;
}

/**
 * The single dispatch point for invoking an executable tool. Callers gate on
 * {@link isExecutableTool} so `function` tools never reach here.
 */
export async function executeTool(
  tool: McpTool | BuiltinTool | PluginTool,
  args: Record<string, unknown>,
  context?: ThreadContext
): Promise<ToolCallResult> {
  if (tool.type === "mcp") {
    const result = await callMcpTool({
      serverId: tool.serverId,
      toolName: tool.toolName,
      arguments: args,
    });
    return {
      contentText: result.contentText,
      isError: result.isError ?? false,
    };
  }
  if (tool.type === "plugin") {
    const pluginContext = tool.contextId
      ? context?.plugins?.find(
          (item) =>
            item.pluginId === tool.pluginId && item.contextId === tool.contextId
        )
      : undefined;
    if (tool.contextId && !pluginContext) {
      throw new Error(
        `Plugin context is unavailable: ${tool.pluginId}/${tool.contextId}`
      );
    }
    const result = await callPluginTool({
      pluginId: tool.pluginId,
      providerId: tool.providerId,
      context: pluginContext,
      toolRef: tool.toolRef,
      arguments: args,
    });
    return {
      contentText: result.contentText,
      isError: result.isError ?? false,
    };
  }
  const result = await callBuiltInTool({ name: tool.name, arguments: args });
  return { contentText: result.contentText, isError: false };
}
