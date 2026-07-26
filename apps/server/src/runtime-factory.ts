import fs from "node:fs/promises";
import path from "node:path";

import {
  createBuiltInToolsModule,
  createLocalFileSystem,
  LocalRuntimeClient,
  McpManager,
  ModelManager,
  NetworkSettingsManager,
  SearchSettingsManager,
  SkillsManager,
  StreamThreadController,
  ToolRegistry,
  TraceManager,
} from "@llm-space/runtime";

export interface ServerRuntimeContext {
  runtime: LocalRuntimeClient;
  homePath: string;
  workspacePath: string;
  stop(): Promise<void>;
}

export async function createServerRuntime(
  homePath: string
): Promise<ServerRuntimeContext> {
  process.env.LLM_SPACE_HOME = homePath;
  const workspacePath = path.join(homePath, "workspace");
  await fs.mkdir(workspacePath, { recursive: true });

  const networkSettings = new NetworkSettingsManager();
  const mcpManager = new McpManager();
  const modelManager = new ModelManager();
  const searchSettings = new SearchSettingsManager();
  const skillsManager = new SkillsManager();
  const localFs = createLocalFileSystem(homePath);
  const streaming = new StreamThreadController(modelManager);
  const traceManager = new TraceManager({ homePath });
  const tools = new ToolRegistry();
  createBuiltInToolsModule({
    env: process.env,
    findSkill: skillsManager.findSkill.bind(skillsManager),
    getSearchSettings: searchSettings.get.bind(searchSettings),
    workspaceRoot: workspacePath,
  }).register(tools);
  tools.freeze();

  const runtime = new LocalRuntimeClient({
    localFs,
    mcpManager,
    modelManager,
    networkSettings,
    searchSettings,
    skillsManager,
    streaming,
    tools,
    traceManager,
  });

  return {
    runtime,
    homePath,
    workspacePath,
    async stop() {
      streaming.shutdown();
      await mcpManager.shutdown();
    },
  };
}
