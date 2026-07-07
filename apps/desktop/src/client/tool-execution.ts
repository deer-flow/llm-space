import type { BuiltinTool, McpTool } from "@llm-space/core";

import { callBuiltInTool } from "@/client/built-in-tools";
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
  tool: McpTool | BuiltinTool,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  if (tool.type === "mcp") {
    const result = await callMcpTool({
      serverId: tool.serverId,
      toolName: tool.toolName,
      arguments: args,
    });
    return { contentText: result.contentText, isError: result.isError ?? false };
  }
  const result = await callBuiltInTool({ name: tool.name, arguments: args });
  return { contentText: result.contentText, isError: false };
}
