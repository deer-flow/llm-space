import {
  readUserTextFile,
  userTextFileExists,
  type LocalFileSystem,
} from "@llm-space/core/server";

import type { McpManager } from "../mcp";
import type { ModelManager } from "../models";
import type { NetworkSettingsManager } from "../network";
import type { SearchSettingsManager } from "../search";
import type { SkillsManager } from "../skills";
import type { StreamThreadController } from "../streaming";
import type { ToolRegistry } from "../tools/tool-registry";
import type { TraceManager } from "../traces";

import { getModelProviderGroups } from "./model-groups";
import type {
  RuntimeAbortStreamPayload,
  RuntimeClient,
  RuntimeInfo,
  RuntimeStreamRequestPayload,
  RuntimeStreamResponsePayload,
} from "./types";

export interface LocalRuntimeClientDependencies {
  localFs: LocalFileSystem;
  mcpManager: McpManager;
  modelManager: ModelManager;
  networkSettings: NetworkSettingsManager;
  searchSettings: SearchSettingsManager;
  skillsManager: SkillsManager;
  streaming: StreamThreadController;
  tools: ToolRegistry;
  traceManager: TraceManager;
  rmPath?: (path: string) => Promise<void>;
}

export class LocalRuntimeClient implements RuntimeClient {
  constructor(private readonly _deps: LocalRuntimeClientDependencies) {}

  info(): RuntimeInfo {
    return {
      id: "local",
      kind: "local",
      name: "Local",
      status: "connected",
      capabilities: [
        "streamThread",
        "filesystem",
        "models",
        "mcp",
        "builtinTools",
        "skills",
        "search",
        "network",
        "traces",
      ],
    };
  }

  availableModels() {
    return getModelProviderGroups(this._deps.modelManager);
  }

  async removeProvider(providerId: string) {
    this._deps.modelManager.removeProvider(providerId);
    return this.availableModels();
  }

  builtinProviders() {
    return this._deps.modelManager.getBuiltinProviders();
  }

  async addProvider(providerId: string) {
    this._deps.modelManager.addBuiltInProvider({ id: providerId });
    return this.availableModels();
  }

  async addCustomProvider(
    input: Parameters<RuntimeClient["addCustomProvider"]>[0]
  ) {
    this._deps.modelManager.addCustomProvider(input);
    return this.availableModels();
  }

  async addProviderProfile(providerId: string) {
    this._deps.modelManager.addProfile(providerId);
    return this.availableModels();
  }

  async updateProviderProfile(
    input: Parameters<RuntimeClient["updateProviderProfile"]>[0]
  ) {
    const { providerId, profileId, ...fields } = input;
    this._deps.modelManager.updateProfile(providerId, profileId, fields);
    return this.availableModels();
  }

  async removeProviderProfile(
    input: Parameters<RuntimeClient["removeProviderProfile"]>[0]
  ) {
    this._deps.modelManager.removeProfile(input.providerId, input.profileId);
    return this.availableModels();
  }

  async updateProvider(input: Parameters<RuntimeClient["updateProvider"]>[0]) {
    const { providerId, ...fields } = input;
    this._deps.modelManager.updateProvider(providerId, fields);
    return this.availableModels();
  }

  async setModelEnabled(
    input: Parameters<RuntimeClient["setModelEnabled"]>[0]
  ) {
    this._deps.modelManager.setModelEnabled(
      input.providerId,
      input.modelId,
      input.enabled
    );
    return this.availableModels();
  }

  async setAllModelsEnabled(
    input: Parameters<RuntimeClient["setAllModelsEnabled"]>[0]
  ) {
    this._deps.modelManager.setAllModelsEnabled(
      input.providerId,
      input.enabled
    );
    return this.availableModels();
  }

  getDefaultModel() {
    return Promise.resolve(this._deps.modelManager.getDefaultModel());
  }

  setDefaultModel(model: Parameters<RuntimeClient["setDefaultModel"]>[0]) {
    this._deps.modelManager.setDefaultModel(model);
    return Promise.resolve(this._deps.modelManager.getDefaultModel());
  }

  async resolveGeneratorEnv(
    input: Parameters<RuntimeClient["resolveGeneratorEnv"]>[0]
  ) {
    const modelApiKey =
      (
        await this._deps.modelManager.resolveConnection({
          providerId: input.providerId,
          profileId: input.profileId,
        })
      ).apiKey ?? "";
    const envValues: Record<string, string> = {};
    for (const name of input.envNames) {
      envValues[name] = process.env[name] ?? "";
    }
    return { modelApiKey, envValues };
  }

  async testModelConnection(
    input: Parameters<RuntimeClient["testModelConnection"]>[0]
  ) {
    await this._deps.streaming.testModelConnection(input);
  }

  async removeCustomModel(
    input: Parameters<RuntimeClient["removeCustomModel"]>[0]
  ) {
    this._deps.modelManager.removeCustomModel(input.providerId, input.modelId);
    return this.availableModels();
  }

  async upsertCustomModel(
    input: Parameters<RuntimeClient["upsertCustomModel"]>[0]
  ) {
    this._deps.modelManager.upsertCustomModel(
      input.providerId,
      input.model,
      input.originalId
    );
    return this.availableModels();
  }

  fsLs(path: string) {
    return this._deps.localFs.ls(path);
  }

  async fsMkdir(path: string) {
    await this._deps.localFs.mkdir(path);
  }

  async fsCp(src: string, dest: string) {
    await this._deps.localFs.cp(src, dest);
  }

  async fsMv(src: string, dest: string) {
    await this._deps.localFs.mv(src, dest);
  }

  async fsRm(path: string) {
    if (this._deps.rmPath) {
      await this._deps.rmPath(path);
      return;
    }
    await this._deps.localFs.rm(path);
  }

  fsRead(path: string) {
    return this._deps.localFs.read(path);
  }

  async fsWrite(path: string, thread: Parameters<RuntimeClient["fsWrite"]>[1]) {
    await this._deps.localFs.write(path, thread);
  }

  fsRealpath(path: string) {
    return Promise.resolve(this._deps.localFs.realpath(path));
  }

  readTextFile(path: string) {
    return readUserTextFile(path);
  }

  textFileExists(path: string) {
    return userTextFileExists(path);
  }

  mcpListServers() {
    return this._deps.mcpManager.listServers();
  }

  mcpAddServer(server: Parameters<RuntimeClient["mcpAddServer"]>[0]) {
    return this._deps.mcpManager.addServer(server);
  }

  mcpUpdateServer(
    serverId: string,
    server: Parameters<RuntimeClient["mcpUpdateServer"]>[1]
  ) {
    return this._deps.mcpManager.updateServer(serverId, server);
  }

  mcpRemoveServer(serverId: string) {
    return this._deps.mcpManager.removeServer(serverId);
  }

  mcpDisconnectServer(serverId: string) {
    return this._deps.mcpManager.disconnectServer(serverId);
  }

  mcpListTools(serverId: string) {
    return this._deps.mcpManager.listTools(serverId);
  }

  mcpCallTool(input: Parameters<RuntimeClient["mcpCallTool"]>[0]) {
    return this._deps.mcpManager.callTool(input);
  }

  builtInListTools() {
    return this._deps.tools.listTools();
  }

  builtInCallTool(input: Parameters<RuntimeClient["builtInCallTool"]>[0]) {
    return this._deps.tools.call(input);
  }

  getSearchSettings() {
    return this._deps.searchSettings.get();
  }

  setSearchSettings(
    settings: Parameters<RuntimeClient["setSearchSettings"]>[0]
  ) {
    return this._deps.searchSettings.set(settings);
  }

  getNetworkSettings() {
    return this._deps.networkSettings.get();
  }

  setNetworkSettings(
    settings: Parameters<RuntimeClient["setNetworkSettings"]>[0]
  ) {
    return this._deps.networkSettings.set(settings);
  }

  detectSystemProxy() {
    return this._deps.networkSettings.detectSystemProxy();
  }

  skillsGetSettings() {
    return this._deps.skillsManager.getConfig();
  }

  skillsAddPath(path: string) {
    return this._deps.skillsManager.addPath(path);
  }

  skillsRemovePath(path: string) {
    return this._deps.skillsManager.removePath(path);
  }

  skillsSetSkillHidden(
    input: Parameters<RuntimeClient["skillsSetSkillHidden"]>[0]
  ) {
    return this._deps.skillsManager.setSkillHidden(
      input.path,
      input.skillName,
      input.hidden
    );
  }

  skillsSetAllSkillsHidden(
    input: Parameters<RuntimeClient["skillsSetAllSkillsHidden"]>[0]
  ) {
    return this._deps.skillsManager.setAllSkillsHidden(
      input.path,
      input.hidden
    );
  }

  skillsListSkills(path: string) {
    return this._deps.skillsManager.listSkills(path);
  }

  skillsReadSkill(path: string) {
    return this._deps.skillsManager.readSkill(path);
  }

  traceListProjects() {
    return this._deps.traceManager.listProjects();
  }

  traceCreateProject(name: string) {
    return this._deps.traceManager.createProject(name);
  }

  traceCreateConnectedProject(
    input: Parameters<RuntimeClient["traceCreateConnectedProject"]>[0]
  ) {
    return this._deps.traceManager.createConnectedProject(input);
  }

  traceListTraces(projectId: string) {
    return this._deps.traceManager.listTraces(projectId);
  }

  traceImportLangfuseJson(
    projectId: string,
    files: Parameters<RuntimeClient["traceImportLangfuseJson"]>[1]
  ) {
    return this._deps.traceManager.importLangfuseJson(projectId, files);
  }

  traceSearchLangfuseTraces(
    input: Parameters<RuntimeClient["traceSearchLangfuseTraces"]>[0]
  ) {
    return this._deps.traceManager.searchLangfuseTraces(input);
  }

  traceSyncLangfuseTraces(
    input: Parameters<RuntimeClient["traceSyncLangfuseTraces"]>[0]
  ) {
    return this._deps.traceManager.syncLangfuseTraces(input);
  }

  traceReadTrace(projectId: string, traceKey: string) {
    return this._deps.traceManager.readTrace(projectId, traceKey);
  }

  traceReadOrCreateWorkbench(projectId: string, traceKey: string) {
    return this._deps.traceManager.readOrCreateWorkbench(projectId, traceKey);
  }

  traceUpdateTraceTitle(projectId: string, traceKey: string, title: string) {
    return this._deps.traceManager.updateTraceTitle(projectId, traceKey, title);
  }

  async traceWriteWorkbench(
    projectId: string,
    traceKey: string,
    thread: Parameters<RuntimeClient["traceWriteWorkbench"]>[2]
  ) {
    await this._deps.traceManager.writeWorkbench(projectId, traceKey, thread);
  }

  streamThread(
    payload: RuntimeStreamRequestPayload,
    send: (message: RuntimeStreamResponsePayload) => void
  ) {
    return this._deps.streaming.run(payload, send);
  }

  abortStream(payload: RuntimeAbortStreamPayload) {
    this._deps.streaming.abort(payload);
  }

  shutdown() {
    this._deps.streaming.shutdown();
  }
}
