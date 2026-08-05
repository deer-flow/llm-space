import type { SkillContent, SkillInfo, SkillsSettings } from "@llm-space/core";

import { electrobun } from "@/lib/electrobun";
import type { RuntimeId } from "@/shared/runtime";

import { runtimeScope } from "./runtime-scope";

function _rpc() {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  return electrobun.rpc;
}

export async function getSkillsSettings(
  runtimeId?: RuntimeId
): Promise<SkillsSettings> {
  return _rpc().request.skillsGetSettings({ ...runtimeScope(runtimeId) });
}

/** Open the native folder picker; resolves to the chosen path or `null`. */
export async function browseForSkillsPath(): Promise<string | null> {
  const { path } = await _rpc().request.skillsBrowseForPath({});
  return path;
}

export async function addSkillsPath(
  path: string,
  runtimeId?: RuntimeId
): Promise<SkillsSettings> {
  return _rpc().request.skillsAddPath({ ...runtimeScope(runtimeId), path });
}

export async function removeSkillsPath(
  path: string,
  runtimeId?: RuntimeId
): Promise<SkillsSettings> {
  return _rpc().request.skillsRemovePath({ ...runtimeScope(runtimeId), path });
}

export async function setSkillHidden(
  path: string,
  skillName: string,
  hidden: boolean,
  runtimeId?: RuntimeId
): Promise<SkillsSettings> {
  return _rpc().request.skillsSetSkillHidden({
    ...runtimeScope(runtimeId),
    path,
    skillName,
    hidden,
  });
}

export async function setPluginSkillHidden(
  pluginId: string,
  skillName: string,
  hidden: boolean,
  runtimeId?: RuntimeId
): Promise<SkillsSettings> {
  return _rpc().request.skillsSetPluginSkillHidden({
    ...runtimeScope(runtimeId),
    pluginId,
    skillName,
    hidden,
  });
}

export async function setAllPluginSkillsHidden(
  pluginId: string,
  hidden: boolean,
  runtimeId?: RuntimeId
): Promise<SkillsSettings> {
  return _rpc().request.skillsSetAllPluginSkillsHidden({
    ...runtimeScope(runtimeId),
    pluginId,
    hidden,
  });
}

export async function setAllSkillsHidden(
  path: string,
  hidden: boolean,
  runtimeId?: RuntimeId
): Promise<SkillsSettings> {
  return _rpc().request.skillsSetAllSkillsHidden({
    ...runtimeScope(runtimeId),
    path,
    hidden,
  });
}

export async function listSkills(
  path: string,
  runtimeId?: RuntimeId
): Promise<SkillInfo[]> {
  return _rpc().request.skillsListSkills({ ...runtimeScope(runtimeId), path });
}

export async function listAvailableSkills(
  runtimeId?: RuntimeId
): Promise<SkillInfo[]> {
  return _rpc().request.skillsListAvailable({ ...runtimeScope(runtimeId) });
}

export async function listPluginSkills(
  runtimeId?: RuntimeId
): Promise<SkillInfo[]> {
  return _rpc().request.skillsListPluginSkills({ ...runtimeScope(runtimeId) });
}

export async function readSkill(
  path: string,
  runtimeId?: RuntimeId
): Promise<SkillContent> {
  return _rpc().request.skillsReadSkill({ ...runtimeScope(runtimeId), path });
}
