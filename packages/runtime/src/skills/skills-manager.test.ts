import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { SkillsManager } from "./skills-manager";

const originalLlmSpaceHome = process.env.LLM_SPACE_HOME;
const temporaryRoots: string[] = [];

function createManagerFixture(): {
  manager: SkillsManager;
  skillDir: string;
  description: string;
} {
  const root = mkdtempSync(path.join(os.tmpdir(), "llm-space-skills-"));
  temporaryRoots.push(root);
  process.env.LLM_SPACE_HOME = path.join(root, "llm-space-home");

  const skillsDir = path.join(root, "skills");
  const skillDir = path.join(skillsDir, "pregnancy-followup");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---
name: pregnancy-followup
description: |
  First trigger line.
  Second trigger line.
---

# Pregnancy follow-up
`,
    "utf8"
  );

  const manager = new SkillsManager();
  manager.addPath(skillsDir);
  return {
    manager,
    skillDir,
    description: "First trigger line.\nSecond trigger line.\n",
  };
}

afterEach(() => {
  if (originalLlmSpaceHome === undefined) {
    delete process.env.LLM_SPACE_HOME;
  } else {
    process.env.LLM_SPACE_HOME = originalLlmSpaceHome;
  }
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("SkillsManager YAML frontmatter", () => {
  test("discovers a skill whose description is a literal block scalar", () => {
    const { manager, skillDir, description } = createManagerFixture();

    expect(manager.listSkills(path.dirname(skillDir))).toEqual([
      {
        name: "pregnancy-followup",
        description,
        path: skillDir,
        enabled: true,
      },
    ]);
  });

  test("reads a literal block description and the markdown body", () => {
    const { manager, skillDir, description } = createManagerFixture();

    expect(manager.readSkill(skillDir)).toEqual({
      frontmatters: {
        name: "pregnancy-followup",
        description,
      },
      content: "\n# Pregnancy follow-up\n",
      path: skillDir,
    });
  });
});
