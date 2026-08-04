import { readFileSync } from "node:fs";
import path from "node:path";

import {
  normalizeMcpName,
  type JsonObject,
  type PluginExtensionKind,
  type PluginCommandView,
  type PluginView,
  type ThreadStorageView,
} from "@llm-space/core";
import { z } from "zod";

import type { McpManager } from "../mcp";
import type { ModelManager } from "../models";
import type { ProviderConfig } from "../models/types";
import type { SkillsManager } from "../skills";

import { PluginCommandRegistry } from "./plugin-command-registry";
import { discoverPlugins } from "./plugin-discovery";
import { interpolatePluginValue } from "./plugin-interpolation";
import { PluginLogger } from "./plugin-logger";
import { PluginSettingsStore } from "./plugin-settings-store";
import {
  PluginSubprocessHost,
  type PluginHostRequestHandler,
} from "./plugin-subprocess-host";
import type {
  DiscoveredPlugin,
  PluginDiscoveryFailure,
  PluginRecord,
} from "./plugin-types";
import { ThreadStorageRegistry } from "./thread-storage-registry";

const McpFileSchema = z.object({
  servers: z.array(
    z
      .object({
        id: z.string().min(1),
        name: z.string().min(1),
        transport: z.enum(["stdio", "streamableHttp", "sse"]),
      })
      .passthrough()
  ),
});
const ModelsFileSchema = z.object({
  providers: z.array(
    z
      .object({
        id: z.string().min(1),
        name: z.string().min(1),
        api: z.enum([
          "anthropic-messages",
          "openai-completions",
          "openai-responses",
        ]),
        models: z.array(z.unknown()).default([]),
      })
      .passthrough()
  ),
});

interface RunnerInitializationResult {
  commands: Omit<PluginCommandView, "pluginId">[];
  storages: Omit<ThreadStorageView, "pluginId" | "source">[];
  errors: {
    id: string;
    kind: "command" | "threadStorage";
    message: string;
    stack?: string;
  }[];
}

export interface PluginManagerOptions {
  homePath: string;
  appVersion: string;
  runnerPath: string;
  skillsManager: Pick<SkillsManager, "setPluginPaths">;
  mcpManager: Pick<McpManager, "setPluginServers">;
  modelManager: Pick<ModelManager, "setPluginProviders">;
  commandRegistry?: PluginCommandRegistry;
  threadStorageRegistry?: ThreadStorageRegistry;
  handleHostRequest?: PluginHostRequestHandler;
  onChanged?: () => void;
}

export class PluginManager {
  readonly commands: PluginCommandRegistry;
  readonly threadStorages: ThreadStorageRegistry;
  private readonly _logger: PluginLogger;
  private readonly _settings: PluginSettingsStore;
  private readonly _records = new Map<string, PluginRecord>();
  private readonly _failures: PluginView[] = [];
  private readonly _hosts = new Map<string, PluginSubprocessHost>();

  private constructor(private readonly _options: PluginManagerOptions) {
    this._logger = new PluginLogger(_options.homePath, _options.appVersion);
    const operationError = (
      pluginId: string,
      stage: string,
      extension: string,
      error: unknown,
      output: string
    ): Error => {
      const record = this._records.get(pluginId);
      const safe = this._logger.writeError({
        pluginId,
        pluginVersion: record?.metadata.version,
        stage,
        extension,
        error,
        output,
      });
      const extensionView = record?.extensions.find(
        (extensionView) => extensionView.id === extension
      );
      if (record && extensionView) {
        extensionView.active = false;
        extensionView.error = safe;
        this._refreshStatus(record);
        this._options.onChanged?.();
      }
      return new Error(
        `${safe.summary} (error-id: ${safe.id}; log: ${safe.logPath})`
      );
    };
    this.commands =
      _options.commandRegistry ?? new PluginCommandRegistry(operationError);
    this.threadStorages =
      _options.threadStorageRegistry ??
      new ThreadStorageRegistry(operationError);
    this._settings = new PluginSettingsStore(_options.homePath);
  }

  static async create(options: PluginManagerOptions): Promise<PluginManager> {
    const manager = new PluginManager(options);
    await manager._discoverAndActivate();
    return manager;
  }

  listPlugins(): PluginView[] {
    return [...this._records.values()]
      .map((record) => this._view(record))
      .concat(this._failures)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async setEnabled(pluginId: string, enabled: boolean): Promise<PluginView[]> {
    this._settings.setEnabled(pluginId, enabled);
    await this.reloadPlugin(pluginId);
    return this.listPlugins();
  }

  async setSettings(
    pluginId: string,
    settings: JsonObject
  ): Promise<PluginView[]> {
    const record = this._requireRecord(pluginId);
    if (record.settingsSchema)
      z.fromJSONSchema(record.settingsSchema).parse(settings);
    this._settings.setSettings(pluginId, settings);
    await this.reloadPlugin(pluginId);
    return this.listPlugins();
  }

  async refreshPlugins(): Promise<PluginView[]> {
    await Promise.all(
      [...this._records.values()].map((record) => this._deactivate(record))
    );
    this._records.clear();
    this._failures.length = 0;
    await this._discoverAndActivate();
    this._options.onChanged?.();
    return this.listPlugins();
  }

  async reloadPlugin(pluginId: string): Promise<void> {
    const previous = this._requireRecord(pluginId);
    await this._deactivate(previous);
    const result = discoverPlugins({
      pluginsPath: path.join(this._options.homePath, "plugins"),
      appVersion: this._options.appVersion,
      logger: this._logger,
    });
    const discovered = result.plugins.find((plugin) => plugin.id === pluginId);
    this._removeFailure(pluginId);
    if (!discovered) {
      this._records.delete(pluginId);
      const failure = result.failures.find((item) => item.id === pluginId);
      if (failure) this._failures.push(this._failureView(failure));
      await this._rebuildContributions();
      this._options.onChanged?.();
      return;
    }
    const record = this._createRecord(discovered);
    this._records.set(pluginId, record);
    if (record.enabled && record.compatible) await this._activate(record);
    await this._rebuildContributions();
    this._options.onChanged?.();
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this._hosts.values()].map((host) => host.shutdown()));
    this._hosts.clear();
  }

  private async _discoverAndActivate(): Promise<void> {
    if (process.env.LLM_SPACE_DISABLE_PLUGINS === "1") {
      await this._rebuildContributions();
      return;
    }
    if (this._settings.loadError) {
      const error = this._logger.writeError({
        stage: "settings",
        error: this._settings.loadError,
        summary:
          "Plugin settings could not be recovered. Third-party plugins are disabled for this launch.",
      });
      this._failures.push({
        id: "_settings",
        displayName: "Plugin Settings",
        version: "unknown",
        path: path.join(this._options.homePath, "settings", "plugins.json"),
        enabled: false,
        compatible: false,
        status: "error",
        settings: {},
        extensions: [],
        error,
      });
    }
    const result = discoverPlugins({
      pluginsPath: path.join(this._options.homePath, "plugins"),
      appVersion: this._options.appVersion,
      logger: this._logger,
    });
    for (const failure of result.failures) {
      this._failures.push(this._failureView(failure));
    }
    for (const plugin of result.plugins) {
      const record = this._createRecord(plugin);
      this._records.set(record.id, record);
      if (record.enabled && record.compatible) await this._activate(record);
    }
    await this._rebuildContributions();
  }

  private _createRecord(plugin: DiscoveredPlugin): PluginRecord {
    const entry = this._settings.get(plugin.id);
    const enabled =
      !this._settings.loadError &&
      entry.enabled &&
      process.env.LLM_SPACE_DISABLE_PLUGINS !== "1";
    return {
      ...plugin,
      enabled,
      settings: entry.settings,
      status: enabled
        ? plugin.compatible
          ? "active"
          : "incompatible"
        : "disabled",
      extensions: [],
      mcpServers: [],
      modelProviders: [],
    };
  }

  private _failureView(failure: PluginDiscoveryFailure): PluginView {
    return {
      id: failure.id,
      displayName: failure.id,
      version: "unknown",
      path: failure.rootPath,
      enabled: false,
      compatible: false,
      status: "error",
      settings: {},
      extensions: [],
      error: failure.error,
    };
  }

  private _removeFailure(pluginId: string): void {
    const index = this._failures.findIndex(
      (failure) => failure.id === pluginId
    );
    if (index >= 0) this._failures.splice(index, 1);
  }

  private async _activate(record: PluginRecord): Promise<void> {
    this._loadSettingsSchema(record);
    this._loadSkills(record);
    this._loadMcp(record);
    this._loadModels(record);
    if (record.commandPaths.length || record.threadStoragePaths.length)
      await this._startRunner(record);
    this._refreshStatus(record);
  }

  private _loadSettingsSchema(record: PluginRecord): void {
    if (!record.settingsSchemaPath) return;
    try {
      const schema = _readObject(record.settingsSchemaPath);
      z.fromJSONSchema(schema);
      record.settingsSchema = schema;
      record.settings = _mergeSchemaDefaults(schema, record.settings);
      this._extension(record, "settings", "settings", "Settings");
    } catch (error) {
      this._extensionError(record, "settings", "settings", "Settings", error);
    }
  }

  private _loadSkills(record: PluginRecord): void {
    for (const skillPath of record.skillPaths)
      this._extension(
        record,
        "skill",
        path.basename(skillPath),
        path.basename(skillPath)
      );
  }

  private _loadMcp(record: PluginRecord): void {
    if (!record.mcpPath) return;
    try {
      const parsed = McpFileSchema.parse(
        interpolatePluginValue(_readObject(record.mcpPath), record.settings)
      );
      const seen = new Set<string>();
      record.mcpServers = parsed.servers.map((server) => {
        const id = `plugin:${record.id}:mcp:${server.id}`;
        if (seen.has(id)) throw new Error(`Duplicate MCP id: ${server.id}`);
        seen.add(id);
        this._extension(record, "mcp", id, server.name);
        return {
          ...server,
          id,
          serverName: normalizeMcpName(id),
          createdAt: 0,
          updatedAt: 0,
        };
      });
    } catch (error) {
      record.mcpServers = [];
      this._extensionError(
        record,
        "mcp",
        `plugin:${record.id}:mcp`,
        "MCP",
        error
      );
    }
  }

  private _loadModels(record: PluginRecord): void {
    if (!record.modelsPath) return;
    try {
      const parsed = ModelsFileSchema.parse(
        interpolatePluginValue(_readObject(record.modelsPath), record.settings)
      );
      const seen = new Set<string>();
      record.modelProviders = parsed.providers.map((provider) => {
        const id = `plugin:${record.id}:model-provider:${provider.id}`;
        if (seen.has(id))
          throw new Error(`Duplicate model provider id: ${provider.id}`);
        seen.add(id);
        this._extension(record, "model", id, provider.name);
        return { ...provider, id, builtin: false } as unknown as ProviderConfig;
      });
    } catch (error) {
      record.modelProviders = [];
      this._extensionError(
        record,
        "model",
        `plugin:${record.id}:models`,
        "Models",
        error
      );
    }
  }

  private async _startRunner(record: PluginRecord): Promise<void> {
    const host = new PluginSubprocessHost(
      this._options.runnerPath,
      record.id,
      this._options.handleHostRequest ??
        (() => Promise.reject(new Error("Host operation is unavailable.")))
    );
    this._hosts.set(record.id, host);
    try {
      const result = await host.call<RunnerInitializationResult>("initialize", {
        settings: record.settings,
        commands: record.commandPaths.map((filePath) => ({
          id: _extensionId(record.id, "command", filePath),
          path: filePath,
        })),
        storages: record.threadStoragePaths.map((filePath) => ({
          id: _extensionId(record.id, "thread-storage", filePath),
          path: filePath,
        })),
      });
      for (const command of result.commands)
        this._extension(record, "command", command.id, command.displayName);
      for (const storage of result.storages)
        this._extension(
          record,
          "threadStorage",
          storage.id,
          storage.displayName
        );
      for (const failure of result.errors) {
        const error = new Error(failure.message);
        if (failure.stack) error.stack = failure.stack;
        this._extensionError(
          record,
          failure.kind,
          failure.id,
          failure.id,
          error
        );
      }
      this.commands.replacePlugin(record.id, host, result.commands);
      this.threadStorages.replacePlugin(record.id, host, result.storages);
    } catch (error) {
      const safe = this._logger.writeError({
        pluginId: record.id,
        pluginVersion: record.metadata.version,
        stage: "runner",
        error,
        output: host.output,
      });
      record.error = safe;
      for (const filePath of record.commandPaths) {
        record.extensions.push({
          id: _extensionId(record.id, "command", filePath),
          kind: "command",
          displayName: path.basename(filePath),
          active: false,
          error: safe,
        });
      }
      for (const filePath of record.threadStoragePaths) {
        record.extensions.push({
          id: _extensionId(record.id, "thread-storage", filePath),
          kind: "threadStorage",
          displayName: path.basename(filePath),
          active: false,
          error: safe,
        });
      }
    }
  }

  private async _deactivate(record: PluginRecord): Promise<void> {
    this.commands.removePlugin(record.id);
    this.threadStorages.removePlugin(record.id);
    const host = this._hosts.get(record.id);
    this._hosts.delete(record.id);
    await host?.shutdown();
  }

  private async _rebuildContributions(): Promise<void> {
    for (const record of this._records.values()) {
      for (const extension of record.extensions) {
        if (extension.error?.stage === "conflict") {
          extension.error = undefined;
          extension.active = true;
        }
      }
      this._refreshStatus(record);
    }
    const active = [...this._records.values()].filter(
      (record) =>
        record.enabled && record.compatible && record.status !== "error"
    );
    const skillConflicts = this._options.skillsManager.setPluginPaths(
      active.flatMap((record) =>
        record.skillPaths.map((skillPath) => ({
          pluginId: record.id,
          path: skillPath,
        }))
      )
    );
    for (const conflict of skillConflicts) {
      const record = this._records.get(conflict.pluginId);
      const extension = record?.extensions.find(
        (item) =>
          item.kind === "skill" &&
          item.displayName === path.basename(conflict.path)
      );
      if (!record || !extension || extension.error) continue;
      extension.active = false;
      extension.error = this._logger.writeError({
        pluginId: record.id,
        pluginVersion: record.metadata.version,
        stage: "conflict",
        extension: extension.id,
        error: new Error(`Skill canonical name conflicts: ${conflict.name}`),
      });
      this._refreshStatus(record);
    }
    await this._options.mcpManager.setPluginServers(
      active.flatMap((record) =>
        record.mcpServers.map((server) => ({ pluginId: record.id, server }))
      )
    );
    this._options.modelManager.setPluginProviders(
      active.flatMap((record) =>
        record.modelProviders.map((provider) => ({
          pluginId: record.id,
          provider,
        }))
      )
    );
  }

  private _extension(
    record: PluginRecord,
    kind: PluginExtensionKind,
    id: string,
    displayName: string
  ): void {
    record.extensions.push({ id, kind, displayName, active: true });
  }

  private _extensionError(
    record: PluginRecord,
    kind: PluginExtensionKind,
    id: string,
    displayName: string,
    error: unknown
  ): void {
    const safe = this._logger.writeError({
      pluginId: record.id,
      pluginVersion: record.metadata.version,
      stage: kind,
      extension: id,
      error,
    });
    record.extensions.push({
      id,
      kind,
      displayName,
      active: false,
      error: safe,
    });
  }

  private _requireRecord(pluginId: string): PluginRecord {
    const record = this._records.get(pluginId);
    if (!record) throw new Error(`Unknown plugin: ${pluginId}`);
    return record;
  }

  private _refreshStatus(record: PluginRecord): void {
    if (!record.enabled) {
      record.status = "disabled";
      return;
    }
    if (!record.compatible) {
      record.status = "incompatible";
      return;
    }
    const failures = record.extensions.filter(
      (extension) => extension.error
    ).length;
    record.status =
      failures === 0
        ? "active"
        : failures < record.extensions.length
          ? "degraded"
          : "error";
  }

  private _view(record: PluginRecord): PluginView {
    return {
      id: record.id,
      displayName: record.metadata.displayName ?? record.id,
      version: record.metadata.version,
      engineRange: record.metadata.engines["llm-space"],
      description: record.metadata.description,
      author:
        typeof record.metadata.author === "string"
          ? record.metadata.author
          : record.metadata.author?.name,
      license: record.metadata.license,
      homepage: record.metadata.homepage,
      path: record.rootPath,
      iconPath: record.iconPath,
      iconDataUrl: record.iconDataUrl,
      enabled: record.enabled,
      compatible: record.compatible,
      status: record.status,
      settings: structuredClone(record.settings),
      settingsSchema:
        record.settingsSchema && structuredClone(record.settingsSchema),
      extensions: structuredClone(record.extensions),
      error: record.error,
    };
  }
}

function _readObject(filePath: string): JsonObject {
  const value: unknown = JSON.parse(readFileSync(filePath, "utf8"));
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw new Error(`${path.basename(filePath)} must contain a JSON object.`);
  return value as JsonObject;
}

function _extensionId(
  pluginId: string,
  kind: string,
  filePath: string
): string {
  return `plugin:${pluginId}:${kind}:${path.basename(filePath, path.extname(filePath))}`;
}

function _mergeSchemaDefaults(
  schema: JsonObject,
  current: JsonObject
): JsonObject {
  const result = structuredClone(current);
  const properties = schema.properties;
  if (
    !properties ||
    typeof properties !== "object" ||
    Array.isArray(properties)
  ) {
    return result;
  }
  for (const [key, rawField] of Object.entries(properties)) {
    if (!rawField || typeof rawField !== "object" || Array.isArray(rawField)) {
      continue;
    }
    const field = rawField as JsonObject;
    if (result[key] === undefined && field.default !== undefined) {
      result[key] = structuredClone(field.default);
    }
    if (field.type === "object") {
      const nested = result[key];
      result[key] = _mergeSchemaDefaults(
        field,
        nested && typeof nested === "object" && !Array.isArray(nested)
          ? nested
          : {}
      );
    }
  }
  return result;
}
