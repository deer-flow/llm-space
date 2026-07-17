/**
 * A single skill-discovery folder, persisted to `settings/skills.json`. The
 * folder itself *is* the skills directory: skills live directly under it as
 * `<path>/<name>/SKILL.md`. `hiddenSkills` records skill names the user toggled
 * off for this folder — a per-folder (provider-level) list, mirroring how
 * `disabledModels` is scoped per model provider.
 */
export interface DiscoveryPathConfig {
  /** As typed; may start with `~` (expanded to the home directory at read). */
  path: string;
  /** Skill names hidden for this folder. */
  hiddenSkills: string[];
}

/** User-configured skills settings, persisted to `settings/skills.json`. */
export interface SkillsSettings {
  discoveryPaths: DiscoveryPathConfig[];
}

/** One discovered skill, as shown in the settings UI. */
export interface SkillInfo {
  name: string;
  description: string;
  /** Absolute path to the skill directory. */
  path: string;
  /** `false` when the skill is in its folder's `hiddenSkills`. */
  enabled: boolean;
}

/** One skill's full content, for the runtime Skill tool. */
export interface SkillContent {
  frontmatters: Record<string, unknown>;
  content: string;
  /** Absolute path to the skill directory. */
  path: string;
}

/**
 * Default discovery folders seeded on a fresh install. The llm-space-managed
 * `<root>/skills` folder is appended by the bun `SkillsManager` (its absolute
 * path depends on `getLlmSpaceHomePath()`, which isn't available in this
 * browser-safe module).
 */
export const DEFAULT_SKILLS_SETTINGS: SkillsSettings = {
  discoveryPaths: [
    { path: "~/.claude/skills", hiddenSkills: [] },
    { path: "~/.codex/skills", hiddenSkills: [] },
    { path: "~/.agents/skills", hiddenSkills: [] },
  ],
};
