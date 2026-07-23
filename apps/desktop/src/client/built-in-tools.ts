import type { BuiltinTool } from "@llm-space/core";

import { electrobun } from "@/lib/electrobun";

function _rpc() {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  return electrobun.rpc;
}

export async function listBuiltInTools(): Promise<BuiltinTool[]> {
  return _rpc().request.builtInListTools({});
}

export async function callBuiltInTool(input: {
  name: string;
  arguments: Record<string, unknown>;
}): Promise<{ contentText: string }> {
  return _rpc().request.builtInCallTool(input);
}

/** Open a directory itself, or reveal a file selected in its parent folder. */
export async function fsReveal(path: string): Promise<void> {
  await _rpc().request.fsReveal({ path });
}
