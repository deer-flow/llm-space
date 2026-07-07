import type { BuiltinTool, McpTool } from "@llm-space/core";

import { callBuiltInTool } from "@/client/built-in-tools";
import { callMcpTool } from "@/client/mcp";

/** A tool the renderer can execute without a manually-entered response. */
export type CallableTool = McpTool | BuiltinTool;

export interface CallableToolResult {
  text: string;
  isError: boolean;
}

/**
 * Execute one MCP or built-in tool call, normalizing thrown errors into an
 * error result so callers can persist it as the tool response.
 */
export async function callThreadTool(
  tool: CallableTool,
  args: Record<string, unknown>
): Promise<CallableToolResult> {
  try {
    if (tool.type === "mcp") {
      const result = await callMcpTool({
        serverId: tool.serverId,
        toolName: tool.toolName,
        arguments: args,
      });
      return { text: result.contentText, isError: result.isError ?? false };
    }
    const result = await callBuiltInTool({
      name: tool.name,
      arguments: args,
    });
    return { text: result.contentText, isError: false };
  } catch (error) {
    return {
      text: error instanceof Error ? error.message : "Tool call failed",
      isError: true,
    };
  }
}
