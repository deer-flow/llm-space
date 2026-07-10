import { existsSync, statSync } from "node:fs";
import path from "node:path";

import { INSTRUCTIONS_CANDIDATES } from "./instructions";
import { existingDirectory, findFirstExisting, realpath } from "./path-utils";
import type { EveDiagnostic, EveProjectDetection } from "./types";

/**
 * Detect whether a local folder looks like an Eve project. Detection is
 * filesystem-only: it never imports or executes project code.
 */
export function detectEveProject(
  projectRootInput: string
): EveProjectDetection {
  const diagnostics: EveDiagnostic[] = [];
  const projectRoot = realpath(projectRootInput);
  const agentDir = path.join(projectRoot, "agent");

  if (!existsSync(agentDir) || !statSync(agentDir).isDirectory()) {
    diagnostics.push({
      level: "error",
      code: "missing_agent_dir",
      message: "Eve project root must contain an agent/ directory.",
      filePath: agentDir,
    });
    return { ok: false, projectRoot, agentDir, diagnostics };
  }

  const instructionsPath = findFirstExisting(
    INSTRUCTIONS_CANDIDATES.map((name) => path.join(agentDir, name))
  );
  if (!instructionsPath) {
    diagnostics.push({
      level: "warning",
      code: "missing_instructions",
      message: "No supported agent/instructions file found.",
      filePath: agentDir,
    });
  }

  const toolsDir = existingDirectory(path.join(agentDir, "tools"));
  if (!toolsDir) {
    diagnostics.push({
      level: "warning",
      code: "missing_tools_dir",
      message:
        "No agent/tools/ directory found; imported thread will have no Eve tools.",
      filePath: path.join(agentDir, "tools"),
    });
  }

  const skillsDir = existingDirectory(path.join(agentDir, "skills"));

  return {
    ok: true,
    projectRoot,
    agentDir,
    ...(instructionsPath ? { instructionsPath } : {}),
    ...(toolsDir ? { toolsDir } : {}),
    ...(skillsDir ? { skillsDir } : {}),
    diagnostics,
  };
}
