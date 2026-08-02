import type { BuiltinTool, McpTool } from "@llm-space/core";

import type { ExecuteTool, ToolCallResult } from "../../../host";

export type GetProviderProfileId = (
  providerId: string,
  selectionScope?: string
) => string | undefined;

export type ToolExecutor = (
  tool: McpTool | BuiltinTool,
  args: Record<string, unknown>
) => Promise<ToolCallResult>;

/** Temporary compatibility for tools persisted before connection metadata. */
const LEGACY_TOOL_CONNECTION_PROVIDERS: Readonly<Record<string, string>> = {
  generate_image: "ark",
};

export function toolProfileSelectionScope(toolName: string): string {
  return `tool:${toolName}`;
}

export function getToolConnectionProviderId(
  tool: McpTool | BuiltinTool
): string | undefined {
  if (tool.type !== "builtin") {
    return undefined;
  }
  return (
    tool.connection?.providerId ?? LEGACY_TOOL_CONNECTION_PROVIDERS[tool.name]
  );
}

/** Bind host/runtime/profile concerns once for both manual and automatic calls. */
export function createToolExecutor({
  executeTool,
  getProfileId,
  runtimeId,
}: {
  executeTool: ExecuteTool;
  getProfileId: GetProviderProfileId;
  runtimeId?: string;
}): ToolExecutor {
  return (tool, args) => {
    const providerId = getToolConnectionProviderId(tool);
    const profileId = providerId
      ? getProfileId(providerId, toolProfileSelectionScope(tool.name))
      : undefined;
    return executeTool(tool, args, {
      runtimeId,
      ...(providerId
        ? {
            connection: {
              providerId,
              ...(profileId ? { profileId } : {}),
            },
          }
        : {}),
    });
  };
}
