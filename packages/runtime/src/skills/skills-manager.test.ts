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

  test("reports every file involved in a plugin skill name conflict", () => {
    const { manager, skillDir } = createManagerFixture();
    const root = mkdtempSync(path.join(os.tmpdir(), "llm-space-plugin-skill-"));
    temporaryRoots.push(root);
    const firstPluginSkill = path.join(root, "plugin-a", "pregnancy-followup");
    const secondPluginSkill = path.join(root, "plugin-b", "pregnancy-followup");
    for (const pluginSkill of [firstPluginSkill, secondPluginSkill]) {
      mkdirSync(pluginSkill, { recursive: true });
      writeFileSync(
        path.join(pluginSkill, "SKILL.md"),
        "---\nname: pregnancy-followup\ndescription: Plugin skill\n---\n"
      );
    }

    expect(
      manager.setPluginPaths([
        { pluginId: "plugin-a", path: firstPluginSkill },
        { pluginId: "plugin-b", path: secondPluginSkill },
      ])
    ).toEqual([
      {
        pluginId: "plugin-a",
        path: firstPluginSkill,
        name: "pregnancy-followup",
        conflictingPaths: [skillDir, secondPluginSkill],
      },
      {
        pluginId: "plugin-b",
        path: secondPluginSkill,
        name: "pregnancy-followup",
        conflictingPaths: [skillDir, firstPluginSkill],
      },
    ]);
    expect(manager.findSkill("pregnancy-followup")).not.toBeNull();
  });

  test("includes plugin skills in the agent list and skill lookup", () => {
    const { manager, skillDir, description } = createManagerFixture();
    const root = mkdtempSync(path.join(os.tmpdir(), "llm-space-plugin-skill-"));
    temporaryRoots.push(root);
    const pluginSkill = path.join(root, "plugin-review");
    mkdirSync(pluginSkill, { recursive: true });
    writeFileSync(
      path.join(pluginSkill, "SKILL.md"),
      "---\nname: plugin-review\ndescription: Review with plugin guidance\n---\n\n# Plugin review\n"
    );

    expect(
      manager.setPluginPaths([{ pluginId: "review-plugin", path: pluginSkill }])
    ).toEqual([]);
    const available = manager.listAvailableSkills();
    expect(available.find((skill) => skill.name === "plugin-review")).toEqual({
      name: "plugin-review",
      description: "Review with plugin guidance",
      path: pluginSkill,
      enabled: true,
      source: "plugin",
      readOnly: true,
      pluginId: "review-plugin",
    });
    expect(available.find((skill) => skill.path === skillDir)).toMatchObject({
      name: "pregnancy-followup",
      description,
      source: "user",
    });
    expect(manager.findSkill("plugin-review")).toMatchObject({
      path: pluginSkill,
      frontmatters: { name: "plugin-review" },
      content: "\n# Plugin review\n",
    });

    manager.setPluginSkillHidden("review-plugin", "plugin-review", true);
    expect(manager.listPluginSkills()).toContainEqual({
      name: "plugin-review",
      description: "Review with plugin guidance",
      path: pluginSkill,
      enabled: false,
      source: "plugin",
      readOnly: true,
      pluginId: "review-plugin",
    });
    expect(
      manager
        .listAvailableSkills()
        .some((skill) => skill.name === "plugin-review")
    ).toBe(false);
    expect(manager.findSkill("plugin-review")).toBeNull();
    expect(
      manager.findSkill("plugin-review", { enabledOnly: false })
    ).not.toBeNull();

    const reloaded = new SkillsManager();
    reloaded.setPluginPaths([{ pluginId: "review-plugin", path: pluginSkill }]);
    expect(reloaded.listPluginSkills()[0]?.enabled).toBe(false);

    reloaded.setPluginSkillHidden("review-plugin", "plugin-review", false);
    expect(reloaded.findSkill("plugin-review")).not.toBeNull();

    reloaded.setAllPluginSkillsHidden("review-plugin", true);
    expect(reloaded.listPluginSkills()[0]?.enabled).toBe(false);
    expect(reloaded.findSkill("plugin-review")).toBeNull();

    reloaded.setAllPluginSkillsHidden("review-plugin", false);
    expect(reloaded.listPluginSkills()[0]?.enabled).toBe(true);
    expect(reloaded.findSkill("plugin-review")).not.toBeNull();
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
