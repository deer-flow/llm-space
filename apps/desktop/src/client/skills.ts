import { electrobun } from "@/lib/electrobun";
import type { SkillContent, SkillInfo, SkillsSettings } from "@/shared/skills";

function _rpc() {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  return electrobun.rpc;
}

export async function getSkillsSettings(): Promise<SkillsSettings> {
  return _rpc().request.skillsGetSettings({});
}

/** Open the native folder picker; resolves to the chosen path or `null`. */
export async function browseForSkillsPath(): Promise<string | null> {
  const { path } = await _rpc().request.skillsBrowseForPath({});
  return path;
}

export async function addSkillsPath(path: string): Promise<SkillsSettings> {
  return _rpc().request.skillsAddPath({ path });
}

export async function removeSkillsPath(path: string): Promise<SkillsSettings> {
  return _rpc().request.skillsRemovePath({ path });
}

export async function setSkillHidden(
  path: string,
  skillName: string,
  hidden: boolean
): Promise<SkillsSettings> {
  return _rpc().request.skillsSetSkillHidden({ path, skillName, hidden });
}

export async function setAllSkillsHidden(
  path: string,
  hidden: boolean
): Promise<SkillsSettings> {
  return _rpc().request.skillsSetAllSkillsHidden({ path, hidden });
}

export async function listSkills(path: string): Promise<SkillInfo[]> {
  return _rpc().request.skillsListSkills({ path });
}

export async function readSkill(path: string): Promise<SkillContent> {
  return _rpc().request.skillsReadSkill({ path });
}
