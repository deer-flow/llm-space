import type {
  McpCallToolResponse,
  McpServerDraft,
  McpServerToolsResponse,
  McpServerView,
} from "@llm-space/core";

import { electrobun } from "@/lib/electrobun";

function _rpc() {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  return electrobun.rpc;
}

export async function listMcpServers(): Promise<McpServerView[]> {
  return _rpc().request.mcpListServers({});
}

export async function addMcpServer(
  server: McpServerDraft
): Promise<McpServerView[]> {
  return _rpc().request.mcpAddServer({ server });
}

export async function updateMcpServer(
  serverId: string,
  server: McpServerDraft
): Promise<McpServerView[]> {
  return _rpc().request.mcpUpdateServer({ serverId, server });
}

export async function removeMcpServer(
  serverId: string
): Promise<McpServerView[]> {
  return _rpc().request.mcpRemoveServer({ serverId });
}

export async function disconnectMcpServer(
  serverId: string
): Promise<McpServerView[]> {
  return _rpc().request.mcpDisconnectServer({ serverId });
}

export async function listMcpTools(
  serverId: string
): Promise<McpServerToolsResponse> {
  return _rpc().request.mcpListTools({ serverId });
}

export async function callMcpTool(input: {
  serverId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}): Promise<McpCallToolResponse> {
  return _rpc().request.mcpCallTool(input);
}
