import type { SkillInfo } from "@llm-space/core";

import type { RuntimeScopedHostOptions, SkillsHost } from "@llm-space/ui/host";

/** Return enabled local skills in stable name order for core prompt rendering. */
export async function listEnabledPromptVariableSkills(
  skills: SkillsHost,
  options?: RuntimeScopedHostOptions
): Promise<SkillInfo[]> {
  const { discoveryPaths } = await skills.getSettings(options);
  const perPath = await Promise.all(
    discoveryPaths.map((entry) =>
      skills.listSkills(entry.path, options).catch((): SkillInfo[] => [])
    )
  );
  const byName = new Map<string, SkillInfo>();
  for (const skill of perPath.flat()) {
    if (skill.enabled && !byName.has(skill.name)) {
      byName.set(skill.name, skill);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
