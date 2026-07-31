import type {
  AgentTransport,
  McpServerView,
  SearchSettings,
  SkillInfo,
} from "@llm-space/core";

import type { HostServices, McpHost, SkillsHost } from "@llm-space/ui/host";

import { listEnabledPromptVariableSkills } from "../variable/prompt-variable-skills";

type GeneratorHost = NonNullable<HostServices["generator"]>;

export interface ProjectGenerationRuntime {
  readonly runtimeId: string;
  readonly transport: AgentTransport;
  listEnabledSkills(): Promise<SkillInfo[]>;
  listMcpServers(): Promise<McpServerView[]>;
  getSearchSettings(): Promise<SearchSettings>;
  resolveEnv(
    providerId: string,
    envNames: string[]
  ): Promise<{ modelApiKey: string; envValues: Record<string, string> }>;
}

/**
 * Bind every runtime-sensitive project-generation capability to one immutable
 * owner. The generated project still writes to the local directory selected by
 * the user, but all model/config/credential reads come from this runtime.
 */
export function bindProjectGenerationRuntime({
  runtimeId,
  createTransport,
  skills,
  mcp,
  generator,
}: {
  runtimeId: string;
  createTransport: HostServices["createTransport"];
  skills: SkillsHost;
  mcp: McpHost;
  generator: GeneratorHost;
}): ProjectGenerationRuntime | null {
  const transport = createTransport(runtimeId);
  if (!transport) {
    return null;
  }

  return {
    runtimeId,
    transport,
    listEnabledSkills: () =>
      listEnabledPromptVariableSkills(skills, { runtimeId }),
    listMcpServers: () => mcp.listServers({ runtimeId }),
    getSearchSettings: () => generator.getSearchSettings({ runtimeId }),
    resolveEnv: (providerId, envNames) =>
      generator.resolveEnv(providerId, envNames, { runtimeId }),
  };
}
