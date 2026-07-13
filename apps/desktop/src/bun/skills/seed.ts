import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { getLlmSpaceHomePath } from "@llm-space/core/server";

// The bundled skills ship with the app; inline their SKILL.md text so the
// bundle is self-contained (no runtime file read of the renderer source tree).
import deepResearchSkill from "../../components/thread-playground/examples/deep-research-skill.md" with { type: "text" };
import frontendDesignSkill from "../../components/thread-playground/examples/frontend-design-skill.md" with { type: "text" };
import grillMeSkill from "../../components/thread-playground/examples/grill-me-skill.md" with { type: "text" };

/** The llm-space-managed skills discovery folder (`<root>/skills`). */
export function getManagedSkillsDir(): string {
  return path.join(getLlmSpaceHomePath(), "skills");
}

/**
 * On a fresh install `<root>/skills` does not exist. Create it and seed the
 * bundled skills as `<name>/SKILL.md`, so the General Agent example has skills
 * to load out of the box. No-op once the folder exists — a user who has cleared
 * or edited their skills folder is never overwritten.
 */
export function seedSkills(): void {
  const skillsDir = getManagedSkillsDir();
  if (existsSync(skillsDir)) {
    return;
  }
  for (const { name, content } of [
    { name: "deep-research", content: deepResearchSkill },
    { name: "frontend-design", content: frontendDesignSkill },
    { name: "grill-me", content: grillMeSkill },
  ]) {
    const dir = path.join(skillsDir, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "SKILL.md"), content, "utf8");
  }
}

// Run on import so the managed skills folder exists before the SkillsManager
// (and the Skill tool) read it.
seedSkills();
