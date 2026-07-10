import type { EveSkillInfo, EveToolCallResult } from "@llm-space/eve";

import { electrobun } from "@/lib/electrobun";

function _rpc() {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  return electrobun.rpc;
}

/**
 * List the skills visible inside one Eve project runtime. This deliberately
 * bypasses global Skills settings so Eve threads see only their own project.
 */
export async function listEveSkills(
  projectRoot: string
): Promise<EveSkillInfo[]> {
  return _rpc().request.eveListSkills({ projectRoot });
}

/**
 * Execute a manual Eve tool call in the project runtime that owns the tool.
 */
export async function callEveTool(input: {
  projectRoot: string;
  runtime: "tool" | "skill";
  toolName: string;
  toolPath?: string;
  arguments: Record<string, unknown>;
}): Promise<EveToolCallResult> {
  return _rpc().request.eveCallTool(input);
}
