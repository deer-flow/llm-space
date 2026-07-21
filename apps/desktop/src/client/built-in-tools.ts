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

/**
 * Reveal an arbitrary absolute path in the OS file manager. Resolves to whether
 * the path existed — a missing path is left for the caller to report.
 */
export async function revealAbsolutePath(path: string): Promise<boolean> {
  const { existed } = await _rpc().request.revealAbsolutePath({ path });
  return existed;
}

/**
 * Open an arbitrary absolute path with the OS default handler — a folder opens
 * in the file manager itself (not selected in its parent). Resolves to whether
 * the path existed.
 */
export async function openAbsolutePath(path: string): Promise<boolean> {
  const { existed } = await _rpc().request.openAbsolutePath({ path });
  return existed;
}

/**
 * Reveal a skill's `SKILL.md` in the OS file manager, resolved by skill name.
 * Resolves to whether a matching skill file was found.
 */
export async function revealSkill(name: string): Promise<boolean> {
  const { existed } = await _rpc().request.revealSkill({ name });
  return existed;
}
