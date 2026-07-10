import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import matter from "gray-matter";
import { isValidSkillName, validateSkillFrontmatter } from "skills-handler";

import { moduleUrl, realpath, resolveInside } from "./path-utils";
import type {
  EveDiagnostic,
  EveSkillContent,
  EveSkillDefinition,
  EveSkillInfo,
} from "./types";

const SKILL_CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".mts"]);

export interface EveSkillListOptions {
  diagnostics?: EveDiagnostic[];
}

/**
 * List skills available to one Eve project. This intentionally ignores LLM
 * Space global Skills settings so imported Eve threads behave like the project
 * being debugged.
 */
export async function listEveProjectSkills(
  projectRootInput: string,
  options: EveSkillListOptions = {}
): Promise<EveSkillInfo[]> {
  const projectRoot = realpath(projectRootInput);
  const skillsDir = path.join(projectRoot, "agent", "skills");
  if (!existsSync(skillsDir) || !statSync(skillsDir).isDirectory()) {
    return [];
  }

  const skills: EveSkillInfo[] = [];
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    const skillPath = path.join(skillsDir, entry.name);
    const loaded = entry.isDirectory()
      ? _readPackagedSkill(skillPath)
      : entry.isFile() && entry.name.endsWith(".md")
        ? _readMarkdownSkill(skillPath)
        : entry.isFile() && SKILL_CODE_EXTENSIONS.has(path.extname(entry.name))
          ? await _readDefinedSkill(skillPath, options.diagnostics)
          : null;
    if (loaded) {
      skills.push(loaded);
    }
  }

  return _dedupeSkills(skills).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Read one Eve project skill by name. The search is scoped to
 * `<project>/agent/skills` and never falls back to LLM Space global skills.
 */
export async function readEveProjectSkill(
  projectRootInput: string,
  name: string,
  options: EveSkillListOptions = {}
): Promise<EveSkillContent | null> {
  const projectRoot = realpath(projectRootInput);
  const skillsDir = path.join(projectRoot, "agent", "skills");
  const match = (await listEveProjectSkills(projectRoot, options)).find(
    (skill) => skill.name === name
  );
  if (!match) {
    return null;
  }

  const skillPath = resolveInside(skillsDir, match.path);
  if (statSync(skillPath).isDirectory()) {
    return _readSkillContent(path.join(skillPath, "SKILL.md"), skillPath);
  }
  if (SKILL_CODE_EXTENSIONS.has(path.extname(skillPath))) {
    return _readDefinedSkillContent(skillPath, options.diagnostics);
  }
  return _readSkillContent(skillPath, path.dirname(skillPath));
}

function _readPackagedSkill(skillDir: string): EveSkillInfo | null {
  const filePath = path.join(skillDir, "SKILL.md");
  if (!existsSync(filePath)) {
    return null;
  }
  const content = _readSkillContent(filePath, skillDir);
  const name = _skillName(content.frontmatters, path.basename(skillDir));
  const description = _skillDescription(content.frontmatters);
  return name && description
    ? { name, description, path: skillDir, enabled: true }
    : null;
}

function _readMarkdownSkill(filePath: string): EveSkillInfo | null {
  const content = _readSkillContent(filePath, path.dirname(filePath));
  const name = _skillName(
    content.frontmatters,
    path.basename(filePath, path.extname(filePath))
  );
  const description = _skillDescription(content.frontmatters);
  return name && description
    ? { name, description, path: filePath, enabled: true }
    : null;
}

async function _readDefinedSkill(
  filePath: string,
  diagnostics: EveDiagnostic[] | undefined
): Promise<EveSkillInfo | null> {
  const definition = await _importSkillDefinition(filePath, diagnostics);
  if (!definition) {
    return null;
  }
  const name = path.basename(filePath, path.extname(filePath));
  return isValidSkillName(name)
    ? {
        name,
        description: definition.description,
        path: filePath,
        enabled: true,
      }
    : null;
}

async function _readDefinedSkillContent(
  filePath: string,
  diagnostics: EveDiagnostic[] | undefined
): Promise<EveSkillContent | null> {
  const definition = await _importSkillDefinition(filePath, diagnostics);
  if (!definition) {
    return null;
  }
  return {
    frontmatters: {
      name: path.basename(filePath, path.extname(filePath)),
      description: definition.description,
    },
    content: definition.markdown,
    path: path.dirname(filePath),
  };
}

function _readSkillContent(
  filePath: string,
  basePath: string
): EveSkillContent {
  const raw = readFileSync(filePath, "utf8");
  const parsed = matter(raw);
  return {
    frontmatters: parsed.data,
    content: parsed.content,
    path: basePath,
  };
}

async function _importSkillDefinition(
  filePath: string,
  diagnostics: EveDiagnostic[] | undefined
): Promise<EveSkillDefinition | null> {
  try {
    const mod = (await import(moduleUrl(filePath))) as { default?: unknown };
    const definition = _asSkillDefinition(mod.default);
    if (!definition) {
      diagnostics?.push({
        level: "warning",
        code: "unsupported_skill_export",
        message:
          "Eve skill module did not default-export a defineSkill() object with description and markdown.",
        filePath,
      });
    }
    return definition;
  } catch (error) {
    diagnostics?.push({
      level: "warning",
      code: "skill_import_failed",
      message: `Could not import Eve skill: ${
        error instanceof Error ? error.message : String(error)
      }`,
      filePath,
    });
    return null;
  }
}

function _asSkillDefinition(value: unknown): EveSkillDefinition | null {
  return value !== null &&
    typeof value === "object" &&
    "description" in value &&
    typeof value.description === "string" &&
    "markdown" in value &&
    typeof value.markdown === "string"
    ? (value as EveSkillDefinition)
    : null;
}

function _skillName(
  frontmatters: Record<string, unknown>,
  fallback: string
): string | null {
  const name =
    typeof frontmatters.name === "string" ? frontmatters.name : fallback;
  if (!isValidSkillName(name)) {
    return null;
  }
  if (validateSkillFrontmatter(frontmatters)) {
    return frontmatters.name;
  }
  return typeof frontmatters.description === "string" ? name : null;
}

function _skillDescription(
  frontmatters: Record<string, unknown>
): string | null {
  return typeof frontmatters.description === "string"
    ? frontmatters.description
    : null;
}

function _dedupeSkills(skills: EveSkillInfo[]): EveSkillInfo[] {
  const byName = new Map<string, EveSkillInfo>();
  for (const skill of skills) {
    if (!byName.has(skill.name)) {
      byName.set(skill.name, skill);
    }
  }
  return [...byName.values()];
}
