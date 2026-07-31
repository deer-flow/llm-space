import type {
  ArkImageGenerationConfig,
  AgentEvent,
  BuiltinTool,
  CustomModel,
  FileNode,
  McpCallToolResponse,
  McpServerDraft,
  McpServerToolsResponse,
  McpServerView,
  ModelConfig,
  ModelProviderGroup,
  NetworkSettings,
  SearchSettings,
  SkillContent,
  SkillInfo,
  SkillsSettings,
  SystemProxyDetection,
  Thread,
} from "@llm-space/core";
import {
  REMOTE_RUNTIME_PROTOCOL_VERSION,
  type RemoteRuntimeHealthResponse,
  type RemoteRuntimeRpcMethod,
  type RemoteRuntimeRpcRequest,
  type RemoteRuntimeRpcResponse,
} from "@llm-space/runtime/remote-protocol";
import type {
  RuntimeAbortStreamPayload,
  RuntimeClient,
  RuntimeId,
  RuntimeInfo,
  RuntimeStreamRequestPayload,
  RuntimeStreamResponsePayload,
} from "@llm-space/runtime/runtime";
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
} from "@llm-space/runtime/traces";

import {
  currentDesktopVersion,
  REQUIRED_REMOTE_CAPABILITIES,
} from "./server-package";

export interface RemoteRuntimeClientOptions {
  id: RuntimeId;
  name: string;
  baseUrl: string;
  token: string;
}

export class RemoteRuntimeClient implements RuntimeClient {
  private readonly _baseUrl: string;
  private _health: RemoteRuntimeHealthResponse | null = null;
  private readonly _activeStreams = new Map<string, AbortController>();

  constructor(private readonly _options: RemoteRuntimeClientOptions) {
    this._baseUrl = _options.baseUrl.replace(/\/+$/, "");
  }

  async connect(): Promise<void> {
    const health = await this._fetchHealth();
    const protocolVersion = Number(health.protocolVersion);
    if (protocolVersion !== REMOTE_RUNTIME_PROTOCOL_VERSION) {
      throw new Error(
        `Remote runtime protocol mismatch: Desktop requires protocol ${REMOTE_RUNTIME_PROTOCOL_VERSION}, server provides ${protocolVersion}. Upgrade the remote server.`
      );
    }
    if (health.version !== currentDesktopVersion()) {
      throw new Error(
        `Remote runtime version mismatch: Desktop requires ${currentDesktopVersion()}, server provides ${health.version}. Upgrade the remote server.`
      );
    }
    const missingCapabilities = REQUIRED_REMOTE_CAPABILITIES.filter(
      (capability) => !health.capabilities.includes(capability)
    );
    if (missingCapabilities.length) {
      throw new Error(
        `Remote runtime is missing required capabilities: ${missingCapabilities.join(", ")}.`
      );
    }
    this._health = health;
  }

  info(): RuntimeInfo {
    return {
      id: this._options.id,
      kind: "remote",
      name: this._options.name,
      status: this._health ? "connected" : "disconnected",
      capabilities: this._health?.capabilities ?? [],
    };
  }

  availableModels() {
    return this._rpc<ModelProviderGroup[]>("models.available");
  }

  builtinProviders() {
    return this._rpc<ModelProviderGroup[]>("models.builtinProviders");
  }

  getDefaultModel() {
    return this._rpc<ModelConfig | null>("models.getDefault");
  }

  resolveGeneratorEnv(
    input: Parameters<RuntimeClient["resolveGeneratorEnv"]>[0]
  ) {
    return this._rpc<{
      modelApiKey: string;
      envValues: Record<string, string>;
    }>("models.resolveGeneratorEnv", input);
  }

  fsLs(path: string) {
    return this._rpc<FileNode[]>("fs.ls", { path });
  }

  async fsMkdir(path: string) {
    await this._rpc<null>("fs.mkdir", { path });
  }

  fsRead(path: string) {
    return this._rpc<Thread>("fs.read", { path });
  }

  async fsWrite(path: string, thread: Thread) {
    await this._rpc<null>("fs.write", { path, thread });
  }

  async fsRealpath(path: string) {
    const result = await this._rpc<{ path: string }>("fs.realpath", { path });
    return result.path;
  }

  mcpListServers() {
    return this._rpc<McpServerView[]>("mcp.listServers");
  }

  builtInListTools() {
    return this._rpc<BuiltinTool[]>("builtinTools.list");
  }

  getSearchSettings() {
    return this._rpc<SearchSettings>("search.get");
  }

  getNetworkSettings() {
    return this._rpc<NetworkSettings>("network.get");
  }

  skillsGetSettings() {
    return this._rpc<SkillsSettings>("skills.getSettings");
  }

  async streamThread(
    payload: RuntimeStreamRequestPayload,
    send: (message: RuntimeStreamResponsePayload) => void
  ): Promise<void> {
    const controller = new AbortController();
    this._activeStreams.set(payload.streamId, controller);
    try {
      const response = await fetch(`${this._baseUrl}/stream`, {
        method: "POST",
        headers: this._headers(),
        body: JSON.stringify({ request: payload.request }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(await _httpError(response));
      }
      if (!response.body) {
        throw new Error("Remote runtime stream response has no body.");
      }
      for await (const value of _parseSse(response.body)) {
        if (value === "[START]") {
          continue;
        }
        if (value === "[DONE]") {
          send({ streamId: payload.streamId, type: "done" });
          return;
        }
        const event = JSON.parse(value) as
          AgentEvent | { type: "error"; message: string };
        if (event.type === "error") {
          send({
            streamId: payload.streamId,
            type: "error",
            message: event.message,
          });
        } else {
          send({ streamId: payload.streamId, type: "event", event });
        }
      }
      send({ streamId: payload.streamId, type: "done" });
    } finally {
      this._activeStreams.delete(payload.streamId);
    }
  }

  abortStream(payload: RuntimeAbortStreamPayload): void {
    this._activeStreams.get(payload.streamId)?.abort();
  }

  shutdown(): void {
    for (const controller of this._activeStreams.values()) {
      controller.abort();
    }
    this._activeStreams.clear();
  }

  async shutdownRemote(): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);
    try {
      await fetch(`${this._baseUrl}/shutdown`, {
        method: "POST",
        headers: this._headers(),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  removeProvider(providerId: string) {
    return this._rpc<ModelProviderGroup[]>("models.removeProvider", {
      providerId,
    });
  }
  addProvider(providerId: string) {
    return this._rpc<ModelProviderGroup[]>("models.addProvider", {
      providerId,
    });
  }
  addCustomProvider(input: {
    id: string;
    name: string;
    baseUrl: string;
    api?: "anthropic-messages" | "openai-completions" | "openai-responses";
  }) {
    return this._rpc<ModelProviderGroup[]>("models.addCustomProvider", input);
  }
  updateProvider(input: {
    providerId: string;
    apiKey?: string | null;
    baseUrl?: string | null;
    headers?: Record<string, string> | null;
    name?: string | null;
    api?:
      "anthropic-messages" | "openai-completions" | "openai-responses" | null;
    icon?: string | null;
    imageGeneration?: ArkImageGenerationConfig;
  }) {
    return this._rpc<ModelProviderGroup[]>("models.updateProvider", input);
  }
  setModelEnabled(input: {
    providerId: string;
    modelId: string;
    enabled: boolean;
  }) {
    return this._rpc<ModelProviderGroup[]>("models.setModelEnabled", input);
  }
  setAllModelsEnabled(input: { providerId: string; enabled: boolean }) {
    return this._rpc<ModelProviderGroup[]>("models.setAllModelsEnabled", input);
  }
  setDefaultModel(model: ModelConfig | null) {
    return this._rpc<ModelConfig | null>("models.setDefault", { model });
  }
  async testModelConnection(input: {
    providerId: string;
    modelId: string;
    candidate?: CustomModel;
  }) {
    await this._rpc<null>("models.testConnection", input);
  }
  removeCustomModel(input: { providerId: string; modelId: string }) {
    return this._rpc<ModelProviderGroup[]>("models.removeCustomModel", input);
  }
  upsertCustomModel(input: {
    providerId: string;
    model: CustomModel;
    originalId?: string;
  }) {
    return this._rpc<ModelProviderGroup[]>("models.upsertCustomModel", input);
  }
  async fsCp(src: string, dest: string) {
    await this._rpc<null>("fs.cp", { src, dest });
  }
  async fsMv(src: string, dest: string) {
    await this._rpc<null>("fs.mv", { src, dest });
  }
  async fsRm(path: string) {
    await this._rpc<null>("fs.rm", { path });
  }
  mcpAddServer(server: McpServerDraft) {
    return this._rpc<McpServerView[]>("mcp.addServer", { server });
  }
  mcpUpdateServer(serverId: string, server: McpServerDraft) {
    return this._rpc<McpServerView[]>("mcp.updateServer", { serverId, server });
  }
  mcpRemoveServer(serverId: string) {
    return this._rpc<McpServerView[]>("mcp.removeServer", { serverId });
  }
  mcpDisconnectServer(serverId: string) {
    return this._rpc<McpServerView[]>("mcp.disconnectServer", { serverId });
  }
  mcpListTools(serverId: string) {
    return this._rpc<McpServerToolsResponse>("mcp.listTools", { serverId });
  }
  mcpCallTool(input: {
    serverId: string;
    toolName: string;
    arguments: Record<string, unknown>;
  }) {
    return this._rpc<McpCallToolResponse>("mcp.callTool", input);
  }
  builtInCallTool(input: {
    name: string;
    arguments: Record<string, unknown>;
    config?: Record<string, unknown>;
  }) {
    return this._rpc<Awaited<ReturnType<RuntimeClient["builtInCallTool"]>>>(
      "builtinTools.call",
      input
    );
  }
  setSearchSettings(settings: SearchSettings) {
    return this._rpc<SearchSettings>("search.set", { settings });
  }
  setNetworkSettings(settings: NetworkSettings) {
    return this._rpc<NetworkSettings>("network.set", { settings });
  }
  detectSystemProxy() {
    return this._rpc<SystemProxyDetection>("network.detectSystemProxy");
  }
  skillsAddPath(path: string) {
    return this._rpc<SkillsSettings>("skills.addPath", { path });
  }
  skillsRemovePath(path: string) {
    return this._rpc<SkillsSettings>("skills.removePath", { path });
  }
  skillsSetSkillHidden(input: {
    path: string;
    skillName: string;
    hidden: boolean;
  }) {
    return this._rpc<SkillsSettings>("skills.setSkillHidden", input);
  }
  skillsSetAllSkillsHidden(input: { path: string; hidden: boolean }) {
    return this._rpc<SkillsSettings>("skills.setAllSkillsHidden", input);
  }
  skillsListSkills(path: string) {
    return this._rpc<SkillInfo[]>("skills.listSkills", { path });
  }
  skillsReadSkill(path: string) {
    return this._rpc<SkillContent>("skills.readSkill", { path });
  }

  traceListProjects() {
    return this._rpc<TraceProject[]>("trace.listProjects");
  }
  traceCreateProject(name: string) {
    return this._rpc<TraceProject>("trace.createProject", { name });
  }
  traceCreateConnectedProject(input: TraceConnectedProjectInput) {
    return this._rpc<TraceProject>("trace.createConnectedProject", input);
  }
  traceListTraces(projectId: string) {
    return this._rpc<TraceRecord[]>("trace.listTraces", { projectId });
  }
  traceImportLangfuseJson(projectId: string, files: TraceImportFile[]) {
    return this._rpc<TraceImportResult>("trace.importLangfuseJson", {
      projectId,
      files,
    });
  }
  traceSearchLangfuseTraces(input: {
    projectId: string;
    filters?: TraceLangfuseSearchInput;
  }) {
    return this._rpc<TraceRemoteTraceSummary[]>(
      "trace.searchLangfuseTraces",
      input
    );
  }
  traceSyncLangfuseTraces(input: { projectId: string; traceIds: string[] }) {
    return this._rpc<TraceSyncResult>("trace.syncLangfuseTraces", input);
  }
  traceReadTrace(projectId: string, traceKey: string) {
    return this._rpc<TraceRecord>("trace.readTrace", { projectId, traceKey });
  }
  traceReadOrCreateWorkbench(projectId: string, traceKey: string) {
    return this._rpc<TraceWorkbenchResponse>("trace.readOrCreateWorkbench", {
      projectId,
      traceKey,
    });
  }
  traceUpdateTraceTitle(projectId: string, traceKey: string, title: string) {
    return this._rpc<TraceWorkbenchResponse>("trace.updateTraceTitle", {
      projectId,
      traceKey,
      title,
    });
  }
  async traceWriteWorkbench(
    projectId: string,
    traceKey: string,
    thread: Thread
  ) {
    await this._rpc<null>("trace.writeWorkbench", {
      projectId,
      traceKey,
      thread,
    });
  }

  private async _fetchHealth(): Promise<RemoteRuntimeHealthResponse> {
    const response = await fetch(`${this._baseUrl}/health`, {
      headers: this._headers(),
    });
    if (!response.ok) {
      throw new Error(await _httpError(response));
    }
    return (await response.json()) as RemoteRuntimeHealthResponse;
  }

  private async _rpc<TResult>(
    method: RemoteRuntimeRpcMethod,
    params?: unknown
  ): Promise<TResult> {
    const request: RemoteRuntimeRpcRequest = {
      id: crypto.randomUUID(),
      method,
      ...(params === undefined ? {} : { params }),
    };
    const response = await fetch(`${this._baseUrl}/rpc`, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error(await _httpError(response));
    }
    const body = (await response.json()) as RemoteRuntimeRpcResponse<TResult>;
    if (!body.ok) {
      throw new Error(body.error.message);
    }
    return body.result;
  }

  private _headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this._options.token}`,
      "Content-Type": "application/json",
    };
  }
}

async function _httpError(response: Response): Promise<string> {
  const text = await response.text();
  return `Remote runtime request failed: HTTP ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`;
}

async function* _parseSse(
  body: ReadableStream<Uint8Array>
): AsyncIterable<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let index: number;
    while ((index = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const data = raw
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) {
        yield data;
      }
    }
  }
}
