import type { Thread } from "@llm-space/core";
import type {
  PluginContext,
  PluginSkillContent,
  PluginSkillSummary,
  PluginSourceImportResult,
  PluginSourceInput,
  PluginSourceProbeResult,
  PluginToolCallResult,
  PluginToolDescriptor,
  PluginView,
} from "@llm-space/plugin-api";

import { electrobun } from "@/lib/electrobun";

function _rpc() {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  return electrobun.rpc;
}

export function listPlugins(): Promise<PluginView[]> {
  return _rpc().request.pluginList({});
}

export function setPluginEnabled(
  pluginId: string,
  enabled: boolean
): Promise<PluginView[]> {
  return _rpc().request.pluginSetEnabled({ pluginId, enabled });
}

export function reloadPlugin(pluginId: string): Promise<PluginView[]> {
  return _rpc().request.pluginReload({ pluginId });
}

export function probePluginSource(input: {
  pluginId: string;
  importerId: string;
  source: PluginSourceInput;
}): Promise<PluginSourceProbeResult> {
  return _rpc().request.pluginProbeSource(input);
}

export function importPluginSource(input: {
  pluginId: string;
  importerId: string;
  source: PluginSourceInput;
}): Promise<PluginSourceImportResult<Thread>> {
  return _rpc().request.pluginImportSource(input);
}

export function listPluginTools(input: {
  pluginId: string;
  providerId: string;
  context: PluginContext;
}): Promise<PluginToolDescriptor[]> {
  return _rpc().request.pluginListTools(input);
}

export function callPluginTool(input: {
  pluginId: string;
  providerId: string;
  context?: PluginContext;
  toolRef: string;
  arguments: Record<string, unknown>;
}): Promise<PluginToolCallResult> {
  return _rpc().request.pluginCallTool(input);
}

export function listPluginSkills(input: {
  pluginId: string;
  providerId: string;
  context: PluginContext;
}): Promise<PluginSkillSummary[]> {
  return _rpc().request.pluginListSkills(input);
}

export function readPluginSkill(input: {
  pluginId: string;
  providerId: string;
  context: PluginContext;
  resourceRef: string;
}): Promise<PluginSkillContent | null> {
  return _rpc().request.pluginReadSkill(input);
}
