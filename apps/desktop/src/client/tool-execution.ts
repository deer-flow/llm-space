import type {
  BuiltinTool,
  BuiltinToolCallResponse,
  McpTool,
  PluginTool,
} from "@llm-space/core";
import type { ExecuteToolOptions } from "@llm-space/ui/host";

import { callBuiltInTool } from "@/client/built-in-tools";
import { callMcpTool } from "@/client/mcp";
import { executePluginTool } from "@/client/plugins";
import type { RuntimeId } from "@/shared/runtime";

/**
 * A tool call's result, normalized across MCP, built-in, and Plugin backends.
 * MCP surfaces `isError` on the response; the local backends signal failure by
 * throwing, so a successful local result is always `isError: false`.
 */
export interface ToolCallResult extends BuiltinToolCallResponse {
  isError: boolean;
}

/**
 * The single dispatch point for invoking an executable tool. Callers gate on
 * {@link isExecutableTool} so `function` tools never reach here.
 */
export async function executeTool(
  tool: McpTool | BuiltinTool | PluginTool,
  args: Record<string, unknown>,
  options: ExecuteToolOptions
): Promise<ToolCallResult> {
  const runtimeId = options.runtimeId as RuntimeId | undefined;
  if (tool.type === "plugin") {
    if (runtimeId !== undefined && runtimeId !== "local") {
      throw new Error("Plugin Tools are available only in the local runtime.");
    }
    const result = await executePluginTool(
      tool,
      options.thread,
      options.variables,
      args
    );
    return { content: result.content, isError: false };
  }
  if (tool.type === "mcp") {
    const result = await callMcpTool(
      {
        serverId: tool.serverId,
        toolName: tool.toolName,
        arguments: args,
      },
      runtimeId
    );
    return {
      content: result.content,
      isError: result.isError ?? false,
    };
  }
  const result = await callBuiltInTool(
    {
      name: tool.name,
      arguments: args,
      config: tool.config,
      connection: options.connection,
    },
    runtimeId
  );
  return {
    content: result.content,
    isError: false,
  };
}
