import { stat } from "node:fs/promises";
import path from "node:path";

import { parseSkillLocator } from "@llm-space/core";
import { expandHomePath } from "@llm-space/core/server";

import { openPath, revealInFileManager } from "../fs";
import type { SkillsManager } from "../skills";

interface FsRevealDependencies {
  skillsManager: Pick<SkillsManager, "findSkill">;
  openPath?: (path: string) => void;
  revealInFileManager?: (path: string) => Promise<void>;
}

/**
 * Open a directory itself, or reveal a file selected in its parent directory.
 *
 * Paths must be absolute after expanding a leading `~`. Internal skill
 * locators are resolved through the skills registry before touching the OS.
 */
export async function fsReveal(
  input: string,
  {
    skillsManager,
    openPath: open = openPath,
    revealInFileManager: reveal = revealInFileManager,
  }: FsRevealDependencies
): Promise<void> {
  const resolved = _resolveInput(input, skillsManager);

  let target;
  try {
    target = await stat(resolved);
  } catch (error) {
    const reason =
      error instanceof Error && error.message ? `: ${error.message}` : "";
    throw new Error(`Cannot access path "${input}"${reason}`, { cause: error });
  }

  if (target.isDirectory()) {
    open(resolved);
    return;
  }
  if (target.isFile()) {
    await reveal(resolved);
    return;
  }
  throw new Error(`Path is not a file or directory: ${input}`);
}

function _resolveInput(
  input: string,
  skillsManager: Pick<SkillsManager, "findSkill">
): string {
  if (input.startsWith("llm-space:")) {
    const skillName = parseSkillLocator(input);
    if (!skillName) {
      throw new Error(`Invalid internal resource locator: ${input}`);
    }
    const skill = skillsManager.findSkill(skillName, { enabledOnly: false });
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }
    if (!path.isAbsolute(skill.path)) {
      throw new Error(`Skill path is not absolute: ${skillName}`);
    }
    return skill.path;
  }

  const expanded = expandHomePath(input);
  if (!path.isAbsolute(expanded)) {
    throw new Error(`Path must be absolute: ${input}`);
  }
  return expanded;
}
