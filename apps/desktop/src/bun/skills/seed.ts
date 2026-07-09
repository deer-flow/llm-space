import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { getLlmSpaceHomePath } from "@llm-space/core/server";

// The Deep Research skill ships with the app; inline its SKILL.md text so the
// bundle is self-contained (no runtime file read of the renderer source tree).
import deepResearchSkill from "../../components/thread-playground/examples/deep-research-skill.md" with { type: "text" };

/** The llm-space-managed skills discovery folder (`<root>/skills`). */
export function getManagedSkillsDir(): string {
  return path.join(getLlmSpaceHomePath(), "skills");
}

/**
 * On a fresh install `<root>/skills` does not exist. Create it and seed the
 * bundled Deep Research skill as `deep-research/SKILL.md`, so the General Agent
 * example has a skill to load out of the box. No-op once the folder exists — a
 * user who has cleared or edited their skills folder is never overwritten.
 */
export function seedSkills(): void {
  const skillsDir = getManagedSkillsDir();
  if (existsSync(skillsDir)) {
    return;
  }
  const deepResearchDir = path.join(skillsDir, "deep-research");
  mkdirSync(deepResearchDir, { recursive: true });
  writeFileSync(
    path.join(deepResearchDir, "SKILL.md"),
    deepResearchSkill,
    "utf8"
  );
}

// Run on import so the managed skills folder exists before the SkillsManager
// (and the Skill tool) read it.
seedSkills();
