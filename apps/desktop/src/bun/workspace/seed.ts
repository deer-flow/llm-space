import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import { getLlmSpaceRoot } from "@llm-space/core/server";

/**
 * On a fresh install `LLM_SPACE_HOME/workspace` does not exist yet. Create the
 * directory and leave it empty so the welcome screen can route users through
 * the explicit "Start from Example" or blank-thread choices. No-op once the
 * workspace directory exists.
 */
export function seedWorkspace(): void {
  const workspace = path.join(getLlmSpaceRoot(), "workspace");
  if (existsSync(workspace)) {
    return;
  }
  mkdirSync(workspace, { recursive: true });
}

// Run on import so the workspace is seeded before storage/RPC touch it.
seedWorkspace();
