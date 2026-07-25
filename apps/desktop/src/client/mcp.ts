import type {
  McpCallToolResponse,
  McpServerDraft,
  McpServerToolsResponse,
  McpServerView,
} from "@llm-space/core";

import { electrobun } from "@/lib/electrobun";
import type { RuntimeId } from "@/shared/runtime";

import { runtimeScope } from "./runtime-scope";

function _rpc() {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  return electrobun.rpc;
}

export async function listMcpServers(
  runtimeId?: RuntimeId
): Promise<McpServerView[]> {
  return _rpc().request.mcpListServers({ ...runtimeScope(runtimeId) });
}

export async function addMcpServer(
  server: McpServerDraft,
  runtimeId?: RuntimeId
): Promise<McpServerView[]> {
  return _rpc().request.mcpAddServer({ ...runtimeScope(runtimeId), server });
}

export async function updateMcpServer(
  serverId: string,
  server: McpServerDraft,
  runtimeId?: RuntimeId
): Promise<McpServerView[]> {
  return _rpc().request.mcpUpdateServer({
    ...runtimeScope(runtimeId),
    serverId,
    server,
  });
}

export async function removeMcpServer(
  serverId: string,
  runtimeId?: RuntimeId
): Promise<McpServerView[]> {
  return _rpc().request.mcpRemoveServer({
    ...runtimeScope(runtimeId),
    serverId,
  });
}

export async function disconnectMcpServer(
  serverId: string,
  runtimeId?: RuntimeId
): Promise<McpServerView[]> {
  return _rpc().request.mcpDisconnectServer({
    ...runtimeScope(runtimeId),
    serverId,
  });
}

export async function listMcpTools(
  serverId: string,
  runtimeId?: RuntimeId
): Promise<McpServerToolsResponse> {
  return _rpc().request.mcpListTools({ ...runtimeScope(runtimeId), serverId });
}

export async function callMcpTool(
  input: {
    serverId: string;
    toolName: string;
    arguments: Record<string, unknown>;
  },
  runtimeId?: RuntimeId
): Promise<McpCallToolResponse> {
  return _rpc().request.mcpCallTool({ ...runtimeScope(runtimeId), ...input });
}
