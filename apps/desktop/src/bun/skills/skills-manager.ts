import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { getSettingsDir } from "@llm-space/core/server";
import matter from "gray-matter";
import { isValidSkillName, validateSkillFrontmatter } from "skills-handler";

import {
  DEFAULT_SKILLS_SETTINGS,
  type DiscoveryPathConfig,
  type SkillContent,
  type SkillInfo,
  type SkillsSettings,
} from "../../shared/skills";

import { getManagedSkillsDir } from "./seed";

/**
 * Owns `settings/skills.json`: the discovery folders backing the built-in Skill
 * tool and, per folder, the skills the user has hidden. Mirrors
 * `SearchSettingsManager`'s eager, synchronous load-and-seed pattern.
 *
 * A discovery folder is itself the skills directory — skills live directly under
 * it as `<folder>/<name>/SKILL.md`. Discovery (`listSkills`) and single-skill
 * reads (`readSkill`) parse `SKILL.md` frontmatter with gray-matter and validate
 * it against the Agent Skills spec via `skills-handler`.
 */
export class SkillsManager {
  private _settings: SkillsSettings;

  constructor() {
    this._settings = this._loadConfig();
  }

  getConfig(): SkillsSettings {
    return this._clone(this._settings);
  }

  /** Append a folder (trimmed, de-duplicated) with an empty hidden list. */
  addPath(inputPath: string): SkillsSettings {
    const p = inputPath.trim();
    if (p === "") {
      return this.getConfig();
    }
    if (!this._settings.discoveryPaths.some((entry) => entry.path === p)) {
      this._settings.discoveryPaths.push({ path: p, hiddenSkills: [] });
      this._saveConfig();
    }
    return this.getConfig();
  }

  removePath(inputPath: string): SkillsSettings {
    const next = this._settings.discoveryPaths.filter(
      (entry) => entry.path !== inputPath
    );
    if (next.length !== this._settings.discoveryPaths.length) {
      this._settings.discoveryPaths = next;
      this._saveConfig();
    }
    return this.getConfig();
  }

  /** Toggle a skill's visibility within one discovery folder. */
  setSkillHidden(
    inputPath: string,
    skillName: string,
    hidden: boolean
  ): SkillsSettings {
    const entry = this._settings.discoveryPaths.find(
      (e) => e.path === inputPath
    );
    if (!entry) {
      return this.getConfig();
    }
    const has = entry.hiddenSkills.includes(skillName);
    if (hidden && !has) {
      entry.hiddenSkills.push(skillName);
      this._saveConfig();
    } else if (!hidden && has) {
      entry.hiddenSkills = entry.hiddenSkills.filter((n) => n !== skillName);
      this._saveConfig();
    }
    return this.getConfig();
  }

  /**
   * Enable or disable every skill in one folder at once. Enabling clears the
   * folder's `hiddenSkills`; disabling hides every skill currently discovered
   * under it.
   */
  setAllSkillsHidden(inputPath: string, hidden: boolean): SkillsSettings {
    const entry = this._settings.discoveryPaths.find(
      (e) => e.path === inputPath
    );
    if (!entry) {
      return this.getConfig();
    }
    entry.hiddenSkills = hidden
      ? this.listSkills(inputPath).map((skill) => skill.name)
      : [];
    this._saveConfig();
    return this.getConfig();
  }

  /**
   * List the skills discovered under one folder. Each subdirectory holding a
   * valid `SKILL.md` becomes one entry; `enabled` reflects the folder's
   * `hiddenSkills`. Passing `enabledOnly` drops the hidden ones (for the runtime
   * Skill tool). A missing or unreadable folder yields `[]`.
   */
  listSkills(
    inputPath: string,
    opts: { enabledOnly?: boolean } = {}
  ): SkillInfo[] {
    const entry = this._settings.discoveryPaths.find(
      (e) => e.path === inputPath
    );
    const hidden = new Set(entry?.hiddenSkills ?? []);
    const dir = this._expand(inputPath);

    let dirents: import("node:fs").Dirent[];
    try {
      dirents = readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    const skills: SkillInfo[] = [];
    for (const dirent of dirents) {
      // Accept real directories and symlinks (skill folders are often
      // symlinked). A symlink to a non-skill target is skipped below when its
      // `SKILL.md` fails to read.
      if (
        (!dirent.isDirectory() && !dirent.isSymbolicLink()) ||
        !isValidSkillName(dirent.name)
      ) {
        continue;
      }
      const skillDir = path.join(dir, dirent.name);
      let data: unknown;
      try {
        const raw = readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
        data = matter(raw).data;
      } catch {
        // No SKILL.md (or unreadable) — not a skill directory.
        continue;
      }
      if (!validateSkillFrontmatter(data)) {
        continue;
      }
      const enabled = !hidden.has(data.name);
      if (opts.enabledOnly && !enabled) {
        continue;
      }
      skills.push({
        name: data.name,
        description: data.description,
        path: skillDir,
        enabled,
      });
    }

    skills.sort((a, b) => a.name.localeCompare(b.name));
    return skills;
  }

  /**
   * Resolve a skill by name across all discovery folders, returning its full
   * content, or `null` when no folder holds a matching skill. Folders are
   * searched in order; the first match wins. By default only enabled skills are
   * considered — the runtime Skill tool must not load hidden ones.
   */
  findSkill(
    name: string,
    opts: { enabledOnly?: boolean } = { enabledOnly: true }
  ): SkillContent | null {
    for (const entry of this._settings.discoveryPaths) {
      const match = this.listSkills(entry.path, opts).find(
        (skill) => skill.name === name
      );
      if (match) {
        return this.readSkill(match.path);
      }
    }
    return null;
  }

  /**
   * Read one skill's full `SKILL.md`: all frontmatter fields plus the markdown
   * body. `skillDir` is an absolute skill directory path (as returned by
   * `listSkills`).
   */
  readSkill(skillDir: string): SkillContent {
    const raw = readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
    const parsed = matter(raw);
    return {
      frontmatters: parsed.data,
      content: parsed.content,
      path: skillDir,
    };
  }

  /** Expand a leading `~` to the home directory. */
  private _expand(p: string): string {
    if (p === "~") {
      return os.homedir();
    }
    if (p.startsWith("~/") || p.startsWith("~\\")) {
      return path.join(os.homedir(), p.slice(2));
    }
    return p;
  }

  private _clone(settings: SkillsSettings): SkillsSettings {
    return {
      discoveryPaths: settings.discoveryPaths.map((entry) => ({
        path: entry.path,
        hiddenSkills: [...entry.hiddenSkills],
      })),
    };
  }

  /**
   * The seeded defaults: the shared browser-safe folders plus the
   * llm-space-managed `<root>/skills` folder (whose absolute path is only
   * resolvable here, in the bun process).
   */
  private _defaultSettings(): SkillsSettings {
    const settings = this._clone(DEFAULT_SKILLS_SETTINGS);
    const managed = getManagedSkillsDir();
    if (!settings.discoveryPaths.some((entry) => entry.path === managed)) {
      settings.discoveryPaths.push({ path: managed, hiddenSkills: [] });
    }
    return settings;
  }

  private get _configPath(): string {
    return path.join(getSettingsDir(), "skills.json");
  }

  private _saveConfig(): void {
    mkdirSync(getSettingsDir(), { recursive: true });
    writeFileSync(
      this._configPath,
      `${JSON.stringify(this._settings, null, 2)}\n`,
      "utf8"
    );
  }

  /**
   * Read `settings/skills.json`, normalizing against defaults so partial or
   * missing files stay valid. Seeds the default config on disk when absent.
   */
  private _loadConfig(): SkillsSettings {
    try {
      const parsed = JSON.parse(
        readFileSync(this._configPath, "utf8")
      ) as Partial<SkillsSettings>;
      return this._normalize(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      const defaults = this._defaultSettings();
      mkdirSync(getSettingsDir(), { recursive: true });
      writeFileSync(
        this._configPath,
        `${JSON.stringify(defaults, null, 2)}\n`,
        "utf8"
      );
      return defaults;
    }
  }

  private _normalize(input: Partial<SkillsSettings>): SkillsSettings {
    if (!Array.isArray(input.discoveryPaths)) {
      return this._defaultSettings();
    }
    const seen = new Set<string>();
    const discoveryPaths: DiscoveryPathConfig[] = [];
    for (const entry of input.discoveryPaths) {
      const p = typeof entry?.path === "string" ? entry.path.trim() : "";
      if (p === "" || seen.has(p)) {
        continue;
      }
      seen.add(p);
      const hiddenSkills = Array.isArray(entry?.hiddenSkills)
        ? entry.hiddenSkills.filter(
            (name): name is string => typeof name === "string"
          )
        : [];
      discoveryPaths.push({ path: p, hiddenSkills });
    }
    return { discoveryPaths };
  }
}
