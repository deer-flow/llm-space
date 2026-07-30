import type { BuiltinTool, BuiltinToolCallResponse } from "@llm-space/core";

import { electrobun } from "@/lib/electrobun";
import type { RuntimeId } from "@/shared/runtime";

import { runtimeScope } from "./runtime-scope";

function _rpc() {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  return electrobun.rpc;
}

export async function listBuiltInTools(
  runtimeId?: RuntimeId
): Promise<BuiltinTool[]> {
  return _rpc().request.builtInListTools({ ...runtimeScope(runtimeId) });
}

export async function callBuiltInTool(
  input: {
    name: string;
    arguments: Record<string, unknown>;
  },
  runtimeId?: RuntimeId
): Promise<BuiltinToolCallResponse> {
  return _rpc().request.builtInCallTool({
    ...runtimeScope(runtimeId),
    ...input,
  });
}

/** Open a directory itself, or reveal a file selected in its parent folder. */
export async function fsReveal(path: string): Promise<void> {
  await _rpc().request.fsReveal({ path });
}
