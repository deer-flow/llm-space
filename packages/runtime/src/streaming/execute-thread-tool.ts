import type {
  BuiltinTool,
  McpTool,
  PluginTool,
  ProviderConnectionRef,
} from "@llm-space/core";
import type { ExecuteThreadTool } from "@llm-space/core/thread";

import type { McpManager } from "../mcp";
import type { PluginToolRegistry } from "../plugins";
import type { ToolRegistry } from "../tools/tool-registry";

/** Temporary compatibility for tools persisted before connection metadata. */
const LEGACY_TOOL_CONNECTION_PROVIDERS: Readonly<Record<string, string>> = {
  generate_image: "ark",
};

export interface CreateRuntimeExecuteToolOptions {
  tools: ToolRegistry;
  mcpManager: McpManager;
  pluginTools?: PluginToolRegistry;
  connection?: ProviderConnectionRef;
}

/** Dispatch built-in, MCP, and Plugin tools the same way the renderer RPC does. */
export function createRuntimeExecuteTool({
  tools,
  mcpManager,
  pluginTools,
  connection,
}: CreateRuntimeExecuteToolOptions): ExecuteThreadTool {
  return async (tool, args, context) => {
    if (tool.type === "plugin") {
      if (!pluginTools) {
        throw new Error("Plugin Tools are available only in the local runtime.");
      }
      const result = await pluginTools.execute(tool, context, args);
      return { content: result.content, isError: false };
    }
    if (tool.type === "mcp") {
      const result = await mcpManager.callTool({
        serverId: tool.serverId,
        toolName: tool.toolName,
        arguments: args,
      });
      return {
        content: result.content,
        isError: result.isError ?? false,
      };
    }
    const result = await tools.call({
      name: tool.name,
      arguments: args,
      config: tool.config,
      connection: _toolConnection(tool, connection),
    });
    return { content: result.content, isError: false };
  };
}

function _toolConnection(
  tool: McpTool | BuiltinTool | PluginTool,
  fallback?: ProviderConnectionRef
): ProviderConnectionRef | undefined {
  if (tool.type !== "builtin") {
    return undefined;
  }
  const providerId =
    tool.connection?.providerId ?? LEGACY_TOOL_CONNECTION_PROVIDERS[tool.name];
  if (!providerId) {
    return undefined;
  }
  if (fallback?.providerId === providerId) {
    return fallback;
  }
  return { providerId };
}
