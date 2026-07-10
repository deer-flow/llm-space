import type { BuiltinTool, EveTool, McpTool } from "@llm-space/core";

import { callBuiltInTool } from "@/client/built-in-tools";
import { callEveTool } from "@/client/eve";
import { callMcpTool } from "@/client/mcp";

/**
 * A tool call's result, normalized across the two backends. MCP surfaces
 * `isError` on the response; built-in tools signal failure by throwing, so a
 * successful built-in result is always `isError: false`.
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
  tool: McpTool | BuiltinTool | EveTool,
  args: Record<string, unknown>
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
  if (tool.type === "eve") {
    const result = await callEveTool({
      projectRoot: tool.projectRoot,
      runtime: tool.runtime,
      toolName: tool.toolName,
      toolPath: tool.toolPath,
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
