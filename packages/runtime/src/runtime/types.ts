import type {
  AgentEvent,
  AgentStreamRequest,
  ArkImageGenerationConfig,
  BuiltinTool,
  BuiltinToolCallResponse,
  CustomModel,
  FileNode,
  McpCallToolResponse,
  McpServerDraft,
  McpServerToolsResponse,
  McpServerView,
  ModelConfig,
  ModelProviderGroup,
  NetworkSettings,
  ProviderProfilePatch,
  SearchSettings,
  SkillContent,
  SkillInfo,
  SkillsSettings,
  SystemProxyDetection,
  Thread,
} from "@llm-space/core";

import type {
  TraceConnectedProjectInput,
  TraceImportFile,
  TraceImportResult,
  TraceLangfuseSearchInput,
  TraceProject,
  TraceRecord,
  TraceRemoteTraceSummary,
  TraceSyncResult,
  TraceWorkbenchResponse,
} from "../traces";

import type { RuntimeId } from "./runtime-id";

export type { RuntimeId };

export type RuntimeCapability =
  | "streamThread"
  | "filesystem"
  | "models"
  | "mcp"
  | "builtinTools"
  | "skills"
  | "search"
  | "network"
  | "traces";

export interface RuntimeInfo {
  id: RuntimeId;
  kind: "local" | "remote";
  name: string;
  status: "connected" | "connecting" | "disconnected" | "error";
  capabilities: RuntimeCapability[];
}

export interface RuntimeScopedParams {
  runtimeId?: RuntimeId;
}

export interface RuntimeStreamRequestPayload extends RuntimeScopedParams {
  streamId: string;
  request: AgentStreamRequest;
  profileId?: string;
}

export interface UpdateProviderProfileInput extends ProviderProfilePatch {
  providerId: string;
  profileId: string;
}

export interface RuntimeAbortStreamPayload extends RuntimeScopedParams {
  streamId: string;
}

export type RuntimeStreamResponsePayload =
  | { streamId: string; type: "event"; event: AgentEvent }
  | { streamId: string; type: "done" }
  | { streamId: string; type: "error"; message: string };

export type MaybePromise<T> = T | Promise<T>;

export interface RuntimeClient {
  info(): RuntimeInfo;

  availableModels(): Promise<ModelProviderGroup[]>;
  removeProvider(providerId: string): Promise<ModelProviderGroup[]>;
  builtinProviders(): Promise<ModelProviderGroup[]>;
  addProvider(providerId: string): Promise<ModelProviderGroup[]>;
  addCustomProvider(input: {
    id: string;
    name: string;
    baseUrl: string;
    api?: "anthropic-messages" | "openai-completions" | "openai-responses";
  }): Promise<ModelProviderGroup[]>;
  addProviderProfile(providerId: string): Promise<ModelProviderGroup[]>;
  updateProviderProfile(
    input: UpdateProviderProfileInput
  ): Promise<ModelProviderGroup[]>;
  removeProviderProfile(input: {
    providerId: string;
    profileId: string;
  }): Promise<ModelProviderGroup[]>;
  updateProvider(input: {
    providerId: string;
    name?: string | null;
    api?:
      "anthropic-messages" | "openai-completions" | "openai-responses" | null;
    icon?: string | null;
    imageGeneration?: ArkImageGenerationConfig;
  }): Promise<ModelProviderGroup[]>;
  setModelEnabled(input: {
    providerId: string;
    modelId: string;
    enabled: boolean;
  }): Promise<ModelProviderGroup[]>;
  setAllModelsEnabled(input: {
    providerId: string;
    enabled: boolean;
  }): Promise<ModelProviderGroup[]>;
  getDefaultModel(): Promise<ModelConfig | null>;
  setDefaultModel(model: ModelConfig | null): Promise<ModelConfig | null>;
  resolveGeneratorEnv(input: {
    providerId: string;
    profileId?: string;
    envNames: string[];
  }): Promise<{ modelApiKey: string; envValues: Record<string, string> }>;
  testModelConnection(input: {
    providerId: string;
    profileId?: string;
    modelId: string;
    candidate?: CustomModel;
  }): Promise<void>;
  removeCustomModel(input: {
    providerId: string;
    modelId: string;
  }): Promise<ModelProviderGroup[]>;
  upsertCustomModel(input: {
    providerId: string;
    model: CustomModel;
    originalId?: string;
  }): Promise<ModelProviderGroup[]>;

  fsLs(path: string): Promise<FileNode[]>;
  fsMkdir(path: string): Promise<void>;
  fsCp(src: string, dest: string): Promise<void>;
  fsMv(src: string, dest: string): Promise<void>;
  fsRm(path: string): Promise<void>;
  fsRead(path: string): Promise<Thread>;
  fsWrite(path: string, thread: Thread): Promise<void>;
  fsRealpath(path: string): Promise<string>;

  mcpListServers(): McpServerView[] | Promise<McpServerView[]>;
  mcpAddServer(
    server: McpServerDraft
  ): McpServerView[] | Promise<McpServerView[]>;
  mcpUpdateServer(
    serverId: string,
    server: McpServerDraft
  ): Promise<McpServerView[]>;
  mcpRemoveServer(serverId: string): Promise<McpServerView[]>;
  mcpDisconnectServer(serverId: string): Promise<McpServerView[]>;
  mcpListTools(serverId: string): Promise<McpServerToolsResponse>;
  mcpCallTool(input: {
    serverId: string;
    toolName: string;
    arguments: Record<string, unknown>;
  }): Promise<McpCallToolResponse>;

  builtInListTools(): MaybePromise<BuiltinTool[]>;
  builtInCallTool(input: {
    name: string;
    arguments: Record<string, unknown>;
    config?: Record<string, unknown>;
  }): Promise<BuiltinToolCallResponse>;

  getSearchSettings(): MaybePromise<SearchSettings>;
  setSearchSettings(settings: SearchSettings): MaybePromise<SearchSettings>;
  getNetworkSettings(): MaybePromise<NetworkSettings>;
  setNetworkSettings(settings: NetworkSettings): MaybePromise<NetworkSettings>;
  detectSystemProxy(): MaybePromise<SystemProxyDetection>;

  skillsGetSettings(): MaybePromise<SkillsSettings>;
  skillsAddPath(path: string): MaybePromise<SkillsSettings>;
  skillsRemovePath(path: string): MaybePromise<SkillsSettings>;
  skillsSetSkillHidden(input: {
    path: string;
    skillName: string;
    hidden: boolean;
  }): MaybePromise<SkillsSettings>;
  skillsSetAllSkillsHidden(input: {
    path: string;
    hidden: boolean;
  }): MaybePromise<SkillsSettings>;
  skillsListSkills(path: string): MaybePromise<SkillInfo[]>;
  skillsReadSkill(path: string): MaybePromise<SkillContent>;

  traceListProjects(): MaybePromise<TraceProject[]>;
  traceCreateProject(name: string): MaybePromise<TraceProject>;
  traceCreateConnectedProject(
    input: TraceConnectedProjectInput
  ): MaybePromise<TraceProject>;
  traceListTraces(projectId: string): MaybePromise<TraceRecord[]>;
  traceImportLangfuseJson(
    projectId: string,
    files: TraceImportFile[]
  ): MaybePromise<TraceImportResult>;
  traceSearchLangfuseTraces(input: {
    projectId: string;
    filters?: TraceLangfuseSearchInput;
  }): MaybePromise<TraceRemoteTraceSummary[]>;
  traceSyncLangfuseTraces(input: {
    projectId: string;
    traceIds: string[];
  }): MaybePromise<TraceSyncResult>;
  traceReadTrace(
    projectId: string,
    traceKey: string
  ): MaybePromise<TraceRecord>;
  traceReadOrCreateWorkbench(
    projectId: string,
    traceKey: string
  ): MaybePromise<TraceWorkbenchResponse>;
  traceUpdateTraceTitle(
    projectId: string,
    traceKey: string,
    title: string
  ): MaybePromise<TraceWorkbenchResponse>;
  traceWriteWorkbench(
    projectId: string,
    traceKey: string,
    thread: Thread
  ): MaybePromise<void>;

  streamThread(
    payload: RuntimeStreamRequestPayload,
    send: (message: RuntimeStreamResponsePayload) => void
  ): Promise<void>;
  abortStream(payload: RuntimeAbortStreamPayload): void;
  shutdown(): void;
}
