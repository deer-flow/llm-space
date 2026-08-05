import type { RuntimeCapability } from "./runtime";

export const REMOTE_RUNTIME_PROTOCOL_VERSION = 3;

export interface RemoteRuntimeHealthResponse {
  ok: true;
  version: string;
  protocolVersion: typeof REMOTE_RUNTIME_PROTOCOL_VERSION;
  capabilities: RuntimeCapability[];
  homePath: string;
  workspacePath: string;
  platform: {
    os: NodeJS.Platform;
    arch: string;
  };
}

export type RemoteRuntimeRpcMethod =
  | "runtime.info"
  | "fs.ls"
  | "fs.mkdir"
  | "fs.cp"
  | "fs.mv"
  | "fs.rm"
  | "fs.read"
  | "fs.write"
  | "fs.realpath"
  | "fs.readText"
  | "fs.textFileExists"
  | "models.available"
  | "models.removeProvider"
  | "models.builtinProviders"
  | "models.addProvider"
  | "models.addCustomProvider"
  | "models.updateProvider"
  | "models.setModelEnabled"
  | "models.setAllModelsEnabled"
  | "models.getDefault"
  | "models.resolveGeneratorEnv"
  | "models.setDefault"
  | "models.testConnection"
  | "models.removeCustomModel"
  | "models.upsertCustomModel"
  | "mcp.listServers"
  | "mcp.addServer"
  | "mcp.updateServer"
  | "mcp.removeServer"
  | "mcp.disconnectServer"
  | "mcp.cancelTest"
  | "mcp.listTools"
  | "mcp.callTool"
  | "builtinTools.list"
  | "builtinTools.call"
  | "search.get"
  | "search.set"
  | "network.get"
  | "network.set"
  | "network.detectSystemProxy"
  | "skills.getSettings"
  | "skills.addPath"
  | "skills.removePath"
  | "skills.setSkillHidden"
  | "skills.setPluginSkillHidden"
  | "skills.setAllPluginSkillsHidden"
  | "skills.setAllSkillsHidden"
  | "skills.listAvailable"
  | "skills.listPluginSkills"
  | "skills.listSkills"
  | "skills.readSkill"
  | "trace.listProjects"
  | "trace.createProject"
  | "trace.createConnectedProject"
  | "trace.listTraces"
  | "trace.importLangfuseJson"
  | "trace.searchLangfuseTraces"
  | "trace.syncLangfuseTraces"
  | "trace.readTrace"
  | "trace.readOrCreateWorkbench"
  | "trace.updateTraceTitle"
  | "trace.writeWorkbench";

export interface RemoteRuntimeRpcRequest<TParams = unknown> {
  id: string;
  method: RemoteRuntimeRpcMethod;
  params?: TParams;
}

export type RemoteRuntimeRpcResponse<TResult = unknown> =
  | { id: string; ok: true; result: TResult }
  | {
      id: string;
      ok: false;
      error: { code: string; message: string; detail?: unknown };
    };
