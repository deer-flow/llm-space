import { createHash } from "node:crypto";
import path from "node:path";

import { uuid } from "@llm-space/core";
import {
  buildMcpToolName,
  normalizeMcpName,
  type McpCallToolResponse,
  type McpDiagnosticCategory,
  type McpDiagnosticOutcome,
  type McpDiagnosticStep,
  type McpDiagnosticStepStatus,
  type McpRemoteTransportType,
  type McpServerDiagnostic,
  type McpServerReadiness,
  type McpServerConfig,
  type McpServerDraft,
  type McpServersConfig,
  type McpServerToolsResponse,
  type McpServerView,
  type McpToolSummary,
  type McpToolView,
} from "@llm-space/core";
import {
  atomicWriteJsonFileSync,
  expandHomePath,
  getSettingsDir,
  readJsonFileSync,
} from "@llm-space/core/server";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  SSEClientTransport,
  SseError,
} from "@modelcontextprotocol/sdk/client/sse.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  CompatibilityCallToolResultSchema,
  type CallToolResult,
  type Tool as SdkMcpTool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const TEST_TIMEOUT_MS = 5 * 60_000;
const CALL_TIMEOUT_MS = 5 * 60_000;
const MAX_OUTPUT_CHARS = 20_000;
const ENV_REFERENCE_PATTERN =
  /\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g;

const stringRecordSchema = z.record(z.string(), z.string());
const toolSummarySchema = z.object({
  toolName: z.string(),
  normalizedToolName: z.string(),
  directName: z.string(),
  description: z.string(),
  inputSchema: z.unknown(),
  requiredFields: z.array(z.string()).optional(),
  topLevelProperties: z.array(z.string()).optional(),
  available: z.boolean(),
  disabledReason: z.string().optional(),
});
const diagnosticStepSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.union([
    z.literal("passed"),
    z.literal("failed"),
    z.literal("skipped"),
  ]),
  message: z.string(),
  detail: z.string().optional(),
});
const diagnosticSchema = z.object({
  outcome: z.union([z.literal("passed"), z.literal("failed")]),
  category: z.union([
    z.literal("success"),
    z.literal("invalidConfig"),
    z.literal("missingSecret"),
    z.literal("unreachable"),
    z.literal("timeout"),
    z.literal("unauthorized"),
    z.literal("httpStatus"),
    z.literal("transportMismatch"),
    z.literal("protocol"),
    z.literal("listTools"),
    z.literal("unknown"),
  ]),
  checkedAt: z.number(),
  transport: z.union([
    z.literal("stdio"),
    z.literal("streamableHttp"),
    z.literal("sse"),
  ]),
  endpoint: z.string().optional(),
  headline: z.string(),
  steps: z.array(diagnosticStepSchema),
  summary: z.string(),
});
const readinessSchema = z.object({
  status: z.union([
    z.literal("untested"),
    z.literal("ready"),
    z.literal("error"),
    z.literal("stale"),
  ]),
  testedAt: z.number().optional(),
  toolCount: z.number().nullable(),
  lastError: z.string().optional(),
  tools: z.array(toolSummarySchema).optional(),
  diagnostic: diagnosticSchema.optional(),
});

const serverConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  serverName: z.string(),
  useOriginalToolNames: z.boolean().optional(),
  transport: z.union([
    z.literal("stdio"),
    z.literal("streamableHttp"),
    z.literal("sse"),
  ]),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  cwd: z.string().nullable().optional(),
  env: stringRecordSchema.optional(),
  url: z.string().optional(),
  headers: stringRecordSchema.optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
  readiness: readinessSchema.optional(),
});

const serversConfigSchema = z.object({
  servers: z.array(serverConfigSchema),
});

const pluginReadinessCacheSchema = z.object({
  servers: z.record(
    z.string(),
    z.object({
      configFingerprint: z.string(),
      readiness: readinessSchema,
    })
  ),
});

interface McpPluginReadinessCache {
  servers: Record<
    string,
    {
      configFingerprint: string;
      readiness: McpServerReadiness;
    }
  >;
}

interface McpClientEntry {
  client: Client;
  tools: SdkMcpTool[] | null;
}

interface McpServerRuntimeStatus {
  toolCount: number | null;
  lastError?: string;
}

interface McpDiagnosticDraft {
  checkedAt: number;
  transport: McpRemoteTransportType;
  endpoint?: string;
  steps: McpDiagnosticStep[];
}

/**
 * Owns `settings/mcp.json` plus live MCP client connections. The manager keeps
 * all process spawning, remote headers, and SDK transports in the Bun process so
 * the renderer only talks through typed RPC.
 */
export class McpManager {
  private _config: McpServersConfig;
  private _pluginReadinessCache: McpPluginReadinessCache;
  private _pluginServers: {
    pluginId: string;
    server: McpServerConfig;
  }[] = [];
  private readonly _clients = new Map<string, McpClientEntry>();
  private readonly _connecting = new Map<string, Promise<McpClientEntry>>();
  private readonly _tests = new Map<string, AbortController>();
  private readonly _status = new Map<string, McpServerRuntimeStatus>();

  constructor() {
    this._config = this._loadConfig();
    this._pluginReadinessCache = this._loadPluginReadinessCache();
  }

  listServers(): McpServerView[] {
    return this._effectiveServers().map((server) => this._toServerView(server));
  }

  async setPluginServers(
    entries: { pluginId: string; server: McpServerConfig }[]
  ): Promise<void> {
    const nextIds = new Set(entries.map((entry) => entry.server.id));
    const nextFingerprints = new Map(
      entries.map(
        (entry) =>
          [entry.server.id, _serverConfigFingerprint(entry.server)] as const
      )
    );
    await Promise.all(
      this._pluginServers
        .filter(
          (entry) =>
            !nextIds.has(entry.server.id) ||
            nextFingerprints.get(entry.server.id) !==
              _serverConfigFingerprint(entry.server)
        )
        .map(async (entry) => {
          await this._closeServer(entry.server.id);
          this._status.delete(entry.server.id);
        })
    );
    const userIds = new Set(this._config.servers.map((server) => server.id));
    const counts = new Map<string, number>();
    for (const entry of entries) {
      counts.set(entry.server.id, (counts.get(entry.server.id) ?? 0) + 1);
    }
    let cacheChanged = false;
    this._pluginServers = entries
      .filter(
        (entry) =>
          !userIds.has(entry.server.id) && counts.get(entry.server.id) === 1
      )
      .map((entry) => {
        const configFingerprint = _serverConfigFingerprint(entry.server);
        const cached = this._pluginReadinessCache.servers[entry.server.id];
        if (!cached) {
          return entry;
        }
        const readiness =
          cached.configFingerprint === configFingerprint
            ? cached.readiness
            : _markReadinessStale(
                cached.readiness,
                entry.server.serverName,
                entry.server.useOriginalToolNames
              );
        if (cached.configFingerprint !== configFingerprint) {
          this._pluginReadinessCache.servers[entry.server.id] = {
            configFingerprint,
            readiness,
          };
          cacheChanged = true;
        }
        return {
          ...entry,
          server: { ...entry.server, readiness },
        };
      });
    if (cacheChanged) {
      this._savePluginReadinessCache();
    }
  }

  addServer(draft: McpServerDraft): McpServerView[] {
    const now = Date.now();
    const server = this._normalizeServerDraft(draft, {
      id: uuid(),
      createdAt: now,
      updatedAt: now,
    });
    this._assertUniqueServerName(server);
    this._config = { servers: [...this._config.servers, server] };
    this._saveConfig();
    return this.listServers();
  }

  async updateServer(
    serverId: string,
    draft: McpServerDraft
  ): Promise<McpServerView[]> {
    const current = this._getUserServer(serverId);
    const server = this._normalizeServerDraft(draft, {
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: Date.now(),
    });
    this._assertUniqueServerName(server, serverId);
    this._config = {
      servers: this._config.servers.map((item) =>
        item.id === serverId
          ? {
              ...server,
              readiness: current.readiness
                ? _markReadinessStale(
                    current.readiness,
                    server.serverName,
                    server.useOriginalToolNames
                  )
                : undefined,
            }
          : item
      ),
    };
    await this._closeServer(serverId);
    this._status.delete(serverId);
    this._saveConfig();
    return this.listServers();
  }

  async removeServer(serverId: string): Promise<McpServerView[]> {
    this._getUserServer(serverId);
    this._config = {
      servers: this._config.servers.filter((server) => server.id !== serverId),
    };
    await this._closeServer(serverId);
    this._status.delete(serverId);
    this._saveConfig();
    return this.listServers();
  }

  async disconnectServer(serverId: string): Promise<McpServerView[]> {
    this._getServer(serverId);
    await this._closeServer(serverId);
    this._status.delete(serverId);
    return this.listServers();
  }

  async cancelTest(serverId: string): Promise<McpServerView[]> {
    this._getServer(serverId);
    this._tests.get(serverId)?.abort();
    await this._closeServer(serverId);
    return this.listServers();
  }

  /** Close every live or connecting client during application shutdown. */
  async shutdown(): Promise<void> {
    for (const controller of this._tests.values()) controller.abort();
    this._tests.clear();
    const serverIds = new Set([
      ...this._clients.keys(),
      ...this._connecting.keys(),
    ]);
    await Promise.all(
      [...serverIds].map((serverId) => this._closeServer(serverId))
    );
    this._status.clear();
  }

  async listTools(serverId: string): Promise<McpServerToolsResponse> {
    const server = this._getServer(serverId);
    if (this._tests.has(serverId)) {
      throw new Error(`MCP test is already running: ${server.name}`);
    }
    const controller = new AbortController();
    this._tests.set(serverId, controller);
    const diagnostic = _isRemoteTransport(server.transport)
      ? _createDiagnosticDraft(server)
      : undefined;
    try {
      if (diagnostic) {
        _passDiagnosticStep(
          diagnostic,
          "config",
          `${_transportLabel(server.transport)} configuration is valid.`
        );
      }
      const entry = await this._connect(server, diagnostic, controller.signal);
      const tools = await this._fetchAllTools(
        entry.client,
        server,
        diagnostic,
        controller.signal
      );
      entry.tools = tools;
      const toolViews = this._toToolViews(server, tools);
      const result = diagnostic
        ? _finishDiagnostic(diagnostic, {
            outcome: "passed",
            category: "success",
            headline: `${toolViews.length} MCP tool${toolViews.length === 1 ? "" : "s"} discovered.`,
          })
        : undefined;
      const updatedServer = this._setServerReadiness(serverId, {
        status: "ready",
        testedAt: Date.now(),
        toolCount: toolViews.length,
        tools: toolViews.map(_toToolSummary),
        diagnostic: result,
      });
      this._status.set(serverId, { toolCount: toolViews.length });
      return {
        server: this._toServerView(updatedServer),
        tools: toolViews,
      };
    } catch (error) {
      if (controller.signal.aborted) {
        await this._closeServer(serverId);
        throw new Error("MCP test cancelled.", { cause: error });
      }
      const category =
        diagnostic && _diagnosticFailedStep(diagnostic, "listTools")
          ? "listTools"
          : _classifyMcpError(error);
      const result = diagnostic
        ? _finishDiagnostic(diagnostic, {
            outcome: "failed",
            category,
            headline: _diagnosticHeadline(error, server, category),
          })
        : undefined;
      const message = result?.headline ?? _safeErrorMessage(error, server);
      const previous = server.readiness;
      const updatedServer = this._setServerReadiness(serverId, {
        status: "error",
        testedAt: Date.now(),
        toolCount: previous?.toolCount ?? null,
        lastError: message,
        tools: previous?.tools ?? [],
        diagnostic: result,
      });
      this._status.set(serverId, {
        toolCount: updatedServer.readiness?.toolCount ?? null,
        lastError: message,
      });
      await this._closeServer(serverId);
      throw new Error(message, { cause: error });
    } finally {
      if (this._tests.get(serverId) === controller) {
        this._tests.delete(serverId);
      }
    }
  }

  async callTool({
    serverId,
    toolName,
    arguments: args,
  }: {
    serverId: string;
    toolName: string;
    arguments: Record<string, unknown>;
  }): Promise<McpCallToolResponse> {
    const server = this._getServer(serverId);
    try {
      const entry = await this._connect(server);
      const result = await entry.client.callTool(
        { name: toolName, arguments: args },
        CompatibilityCallToolResultSchema,
        { timeout: CALL_TIMEOUT_MS }
      );
      return _flattenToolResult(result as CallToolResult);
    } catch (error) {
      const message = _safeErrorMessage(error, server);
      this._status.set(serverId, {
        toolCount: this._status.get(serverId)?.toolCount ?? null,
        lastError: message,
      });
      throw new Error(message, { cause: error });
    }
  }

  private async _connect(
    server: McpServerConfig,
    diagnostic?: McpDiagnosticDraft,
    signal?: AbortSignal
  ): Promise<McpClientEntry> {
    const cached = this._clients.get(server.id);
    if (cached) {
      if (diagnostic) {
        _passDiagnosticStep(
          diagnostic,
          "secrets",
          "Using existing connection."
        );
        _passDiagnosticStep(
          diagnostic,
          "transport",
          "Connection is already open."
        );
        _passDiagnosticStep(
          diagnostic,
          "initialize",
          "MCP session is already initialized."
        );
      }
      return cached;
    }
    const connecting = this._connecting.get(server.id);
    if (connecting) {
      const entry = await connecting;
      if (diagnostic) {
        _passDiagnosticStep(
          diagnostic,
          "secrets",
          "Using in-flight connection."
        );
        _passDiagnosticStep(diagnostic, "transport", "Connection opened.");
        _passDiagnosticStep(
          diagnostic,
          "initialize",
          "MCP session initialized."
        );
      }
      return entry;
    }
    const promise = this._openConnection(server, diagnostic, signal);
    this._connecting.set(server.id, promise);
    try {
      return await promise;
    } finally {
      this._connecting.delete(server.id);
    }
  }

  private async _openConnection(
    server: McpServerConfig,
    diagnostic?: McpDiagnosticDraft,
    signal?: AbortSignal
  ): Promise<McpClientEntry> {
    const client = new Client({
      name: "llm-space",
      version: "1.0.0",
    });
    const transport = this._createTransport(server, diagnostic);
    try {
      await client.connect(transport, { timeout: TEST_TIMEOUT_MS, signal });
      if (diagnostic) {
        _passDiagnosticStep(diagnostic, "transport", "Connection opened.");
        _passDiagnosticStep(
          diagnostic,
          "initialize",
          "MCP session initialized."
        );
      }
    } catch (error) {
      if (diagnostic) {
        _markConnectFailure(diagnostic, error, server);
      }
      try {
        await client.close();
      } catch {
        // Failed startup cleanup is best-effort.
      }
      throw error;
    }
    const entry: McpClientEntry = { client, tools: null };
    this._clients.set(server.id, entry);
    return entry;
  }

  private _createTransport(
    server: McpServerConfig,
    diagnostic?: McpDiagnosticDraft
  ) {
    if (server.transport === "stdio") {
      let env: Record<string, string>;
      try {
        env = this._resolveValueMap(server.env ?? {});
      } catch (error) {
        if (diagnostic) {
          _markSecretFailure(diagnostic, error, server);
        }
        throw error;
      }
      if (diagnostic) {
        _passDiagnosticStep(
          diagnostic,
          "secrets",
          "Environment values resolved."
        );
      }
      return new StdioClientTransport({
        command: expandHomePath(server.command ?? ""),
        args: server.args ?? [],
        cwd: server.cwd ? expandHomePath(server.cwd) : undefined,
        env: {
          ...getDefaultEnvironment(),
          ...env,
        },
        stderr: "ignore",
      });
    }

    let url: URL;
    try {
      url = new URL(server.url ?? "");
    } catch (error) {
      if (diagnostic) {
        _markInvalidConfigFailure(diagnostic, error, server);
      }
      throw error;
    }

    let headers: Record<string, string>;
    try {
      headers = this._resolveValueMap(server.headers ?? {});
    } catch (error) {
      if (diagnostic) {
        _markSecretFailure(diagnostic, error, server);
      }
      throw error;
    }
    if (diagnostic) {
      _passDiagnosticStep(
        diagnostic,
        "secrets",
        Object.keys(headers).length > 0
          ? `${Object.keys(headers).length} header value${Object.keys(headers).length === 1 ? "" : "s"} resolved.`
          : "No remote headers configured."
      );
    }
    const requestInit =
      Object.keys(headers).length > 0 ? { headers } : undefined;

    if (server.transport === "streamableHttp") {
      return new StreamableHTTPClientTransport(url, { requestInit });
    }

    const fetchWithHeaders =
      Object.keys(headers).length > 0
        ? (input: string | URL, init: RequestInit = {}) =>
            fetch(input, {
              ...init,
              headers: { ...headers, ..._headersToRecord(init.headers) },
            })
        : undefined;
    return new SSEClientTransport(url, {
      requestInit,
      eventSourceInit: fetchWithHeaders ? { fetch: fetchWithHeaders } : {},
    });
  }

  private async _fetchAllTools(
    client: Client,
    server: McpServerConfig,
    diagnostic?: McpDiagnosticDraft,
    signal?: AbortSignal
  ): Promise<SdkMcpTool[]> {
    const tools: SdkMcpTool[] = [];
    let cursor: string | undefined;
    try {
      do {
        const response = await client.listTools(
          cursor ? { cursor } : undefined,
          {
            timeout: TEST_TIMEOUT_MS,
            signal,
          }
        );
        tools.push(...response.tools);
        cursor = response.nextCursor;
      } while (cursor);
    } catch (error) {
      if (diagnostic) {
        _failDiagnosticStep(diagnostic, "listTools", "Tool listing failed.", {
          detail: _safeErrorMessage(error, server),
        });
      }
      throw error;
    }
    if (diagnostic) {
      _passDiagnosticStep(
        diagnostic,
        "listTools",
        `${tools.length} tool${tools.length === 1 ? "" : "s"} listed.`
      );
    }
    return tools;
  }

  private _toToolViews(
    server: McpServerConfig,
    tools: SdkMcpTool[]
  ): McpToolView[] {
    const normalizedCounts = new Map<string, number>();
    const normalizedNames = tools.map((tool) => normalizeMcpName(tool.name));
    for (const name of normalizedNames) {
      normalizedCounts.set(name, (normalizedCounts.get(name) ?? 0) + 1);
    }

    return tools.map((tool, index) => {
      const normalizedToolName = normalizedNames[index] ?? "";
      const collision = (normalizedCounts.get(normalizedToolName) ?? 0) > 1;
      const available = normalizedToolName !== "" && !collision;
      return {
        serverId: server.id,
        serverName: server.serverName,
        serverDisplayName: server.name,
        toolName: tool.name,
        normalizedToolName,
        directName: buildMcpToolName({
          serverName: server.serverName,
          toolName: normalizedToolName,
          useOriginalToolNames: server.useOriginalToolNames,
        }),
        description: tool.description ?? "",
        inputSchema: tool.inputSchema,
        ..._summarizeInputSchema(tool.inputSchema),
        available,
        disabledReason:
          normalizedToolName === ""
            ? "Tool name normalizes to an empty string"
            : collision
              ? "Tool name collides after normalization"
              : undefined,
      };
    });
  }

  private _setServerReadiness(
    serverId: string,
    readiness: McpServerReadiness
  ): McpServerConfig {
    let updated: McpServerConfig | null = null;
    this._config = {
      servers: this._config.servers.map((server) => {
        if (server.id !== serverId) {
          return server;
        }
        updated = { ...server, readiness };
        return updated;
      }),
    };
    if (!updated) {
      const plugin = this._pluginServers.find(
        (entry) => entry.server.id === serverId
      );
      if (!plugin) throw new Error(`MCP server not configured: ${serverId}`);
      plugin.server = { ...plugin.server, readiness };
      this._pluginReadinessCache.servers[serverId] = {
        configFingerprint: _serverConfigFingerprint(plugin.server),
        readiness,
      };
      this._savePluginReadinessCache();
      return plugin.server;
    }
    this._saveConfig();
    return updated;
  }

  private _toServerView(server: McpServerConfig): McpServerView {
    const status = this._status.get(server.id);
    const readiness = server.readiness ?? {
      status: "untested",
      toolCount: null,
      tools: [],
    };
    const plugin = this._pluginServers.find(
      (entry) => entry.server.id === server.id
    );
    return {
      ...server,
      readiness,
      connected: this._clients.has(server.id),
      toolCount: status?.toolCount ?? readiness.toolCount,
      lastError: status?.lastError ?? readiness.lastError,
      source: plugin ? "plugin" : "user",
      readOnly: Boolean(plugin),
      pluginId: plugin?.pluginId,
    };
  }

  private _normalizeServerDraft(
    draft: McpServerDraft,
    metadata: Pick<McpServerConfig, "id" | "createdAt" | "updatedAt">
  ): McpServerConfig {
    const name = draft.name.trim();
    if (!name) {
      throw new Error("MCP server name is required.");
    }
    const serverName = normalizeMcpName(name);
    if (!serverName) {
      throw new Error("MCP server name must contain letters or numbers.");
    }
    if (draft.transport === "stdio") {
      const command = draft.command?.trim();
      if (!command) {
        throw new Error("Stdio MCP servers require a command.");
      }
      return {
        ...metadata,
        name,
        serverName,
        useOriginalToolNames: draft.useOriginalToolNames === true,
        transport: "stdio",
        command,
        args: (draft.args ?? []).map((arg) => arg.trim()).filter(Boolean),
        cwd: draft.cwd?.trim() || null,
        env: _cleanRecord(draft.env),
      };
    }

    const url = draft.url?.trim();
    if (!url) {
      throw new Error("Remote MCP servers require a URL.");
    }
    try {
      new URL(url);
    } catch {
      throw new Error("Remote MCP server URL is invalid.");
    }
    return {
      ...metadata,
      name,
      serverName,
      useOriginalToolNames: draft.useOriginalToolNames === true,
      transport: draft.transport,
      url,
      headers: _cleanRecord(draft.headers),
    };
  }

  private _assertUniqueServerName(server: McpServerConfig, exceptId?: string) {
    const existing = this._effectiveServers().find(
      (item) => item.id !== exceptId && item.serverName === server.serverName
    );
    if (existing) {
      throw new Error(`MCP server name "${server.serverName}" already exists.`);
    }
  }

  private _getServer(serverId: string): McpServerConfig {
    const server = this._effectiveServers().find(
      (item) => item.id === serverId
    );
    if (!server) {
      throw new Error(`MCP server not configured: ${serverId}`);
    }
    return server;
  }

  private _getUserServer(serverId: string): McpServerConfig {
    const server = this._config.servers.find((item) => item.id === serverId);
    if (!server)
      throw new Error(`MCP server is read-only or unavailable: ${serverId}`);
    return server;
  }

  private _effectiveServers(): McpServerConfig[] {
    return [
      ...this._config.servers,
      ...this._pluginServers.map((entry) => entry.server),
    ];
  }

  private async _closeServer(serverId: string): Promise<void> {
    const pending = this._connecting.get(serverId);
    this._connecting.delete(serverId);
    const cached = this._clients.get(serverId);
    this._clients.delete(serverId);
    const entries = new Set<McpClientEntry>();
    if (cached) {
      entries.add(cached);
    }
    if (pending) {
      try {
        entries.add(await pending);
      } catch {
        // A failed in-flight connection has no live client to close.
      }
      this._clients.delete(serverId);
    }
    for (const entry of entries) {
      try {
        await entry.client.close();
      } catch {
        // Closing is best-effort during config edits/removal.
      }
    }
  }

  private _resolveValueMap(
    values: Record<string, string>
  ): Record<string, string> {
    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      const trimmedKey = key.trim();
      if (!trimmedKey) {
        continue;
      }
      resolved[trimmedKey] = _resolveValue(value);
    }
    return resolved;
  }

  private get _configPath(): string {
    return path.join(getSettingsDir(), "mcp.json");
  }

  private get _pluginReadinessCachePath(): string {
    return path.join(getSettingsDir(), "mcp-plugin-readiness.json");
  }

  private _saveConfig(): void {
    atomicWriteJsonFileSync(this._configPath, this._config);
  }

  private _savePluginReadinessCache(): void {
    atomicWriteJsonFileSync(
      this._pluginReadinessCachePath,
      this._pluginReadinessCache
    );
  }

  private _loadConfig(): McpServersConfig {
    const parsed = readJsonFileSync(this._configPath, {
      schema: serversConfigSchema,
      recovery: "best-effort",
      fallback: (): McpServersConfig => ({ servers: [] }),
      seedMissing: true,
    }).value;
    return {
      servers: parsed.servers.map((server) => ({
        ...server,
        createdAt: server.createdAt ?? Date.now(),
        updatedAt: server.updatedAt ?? Date.now(),
        readiness: server.readiness
          ? _normalizeReadiness(server.readiness)
          : undefined,
      })),
    };
  }

  private _loadPluginReadinessCache(): McpPluginReadinessCache {
    const parsed = readJsonFileSync(this._pluginReadinessCachePath, {
      schema: pluginReadinessCacheSchema,
      recovery: "best-effort",
      fallback: (): McpPluginReadinessCache => ({ servers: {} }),
      seedMissing: true,
    }).value;
    return {
      servers: Object.fromEntries(
        Object.entries(parsed.servers).map(([serverId, entry]) => [
          serverId,
          {
            configFingerprint: entry.configFingerprint,
            readiness: _normalizeReadiness(entry.readiness),
          },
        ])
      ),
    };
  }
}

const DIAGNOSTIC_STEP_LABELS: Record<string, string> = {
  config: "Validate configuration",
  secrets: "Resolve headers and environment",
  transport: "Open remote transport",
  initialize: "Initialize MCP session",
  listTools: "List tools",
  result: "Result",
};

/**
 * Starts a remote-only diagnostic snapshot. Inputs are the saved server config;
 * output is a mutable draft whose endpoint has query strings stripped. This
 * helper must only be called for Streamable HTTP/SSE servers because stdio
 * diagnostics are outside the V1 scope.
 */
function _createDiagnosticDraft(server: McpServerConfig): McpDiagnosticDraft {
  if (!_isRemoteTransport(server.transport)) {
    throw new Error("MCP diagnostics are only available for remote servers.");
  }
  return {
    checkedAt: Date.now(),
    transport: server.transport,
    endpoint: _safeEndpoint(server),
    steps: Object.entries(DIAGNOSTIC_STEP_LABELS).map(([id, label]) => ({
      id,
      label,
      status: "skipped",
      message: "Not reached.",
    })),
  };
}

/**
 * Records a successful diagnostic phase. It mutates only the in-memory
 * diagnostic draft for the current Connect & Test run.
 */
function _passDiagnosticStep(
  diagnostic: McpDiagnosticDraft,
  id: string,
  message: string,
  options: { detail?: string } = {}
): void {
  _setDiagnosticStep(diagnostic, id, {
    status: "passed",
    message,
    detail: options.detail,
  });
}

/**
 * Records a failed diagnostic phase with redacted detail. It mutates only the
 * in-memory diagnostic draft for the current Connect & Test run.
 */
function _failDiagnosticStep(
  diagnostic: McpDiagnosticDraft,
  id: string,
  message: string,
  options: { detail?: string } = {}
): void {
  _setDiagnosticStep(diagnostic, id, {
    status: "failed",
    message,
    detail: options.detail,
  });
}

/**
 * Marks a diagnostic phase as intentionally unreachable after an earlier
 * failure. It mutates only the in-memory diagnostic draft.
 */
function _skipDiagnosticStep(
  diagnostic: McpDiagnosticDraft,
  id: string,
  message: string
): void {
  _setDiagnosticStep(diagnostic, id, { status: "skipped", message });
}

/**
 * Applies a phase update by id. Unknown ids are ignored so older persisted
 * diagnostics or future labels cannot crash rendering.
 */
function _setDiagnosticStep(
  diagnostic: McpDiagnosticDraft,
  id: string,
  patch: {
    status: McpDiagnosticStepStatus;
    message: string;
    detail?: string;
  }
): void {
  diagnostic.steps = diagnostic.steps.map((step) =>
    step.id === id ? { ...step, ...patch } : step
  );
}

/**
 * Checks whether a phase already failed so the final result can preserve the
 * most specific category, such as list-tools failures after initialization.
 */
function _diagnosticFailedStep(
  diagnostic: McpDiagnosticDraft,
  id: string
): boolean {
  return diagnostic.steps.some(
    (step) => step.id === id && step.status === "failed"
  );
}

/**
 * Handles missing header/env expansion. Inputs are the raw error and server
 * config; side effects are redacted step updates and downstream skips.
 */
function _markSecretFailure(
  diagnostic: McpDiagnosticDraft,
  error: unknown,
  server: McpServerConfig
): void {
  const message = _safeErrorMessage(error, server);
  _failDiagnosticStep(diagnostic, "secrets", "Secret resolution failed.", {
    detail: message,
  });
  _skipDiagnosticStep(diagnostic, "transport", "Skipped after secret failure.");
  _skipDiagnosticStep(
    diagnostic,
    "initialize",
    "Skipped after secret failure."
  );
  _skipDiagnosticStep(diagnostic, "listTools", "Skipped after secret failure.");
}

/**
 * Handles malformed persisted remote URLs. It records config failure before any
 * secret resolution or network work can happen.
 */
function _markInvalidConfigFailure(
  diagnostic: McpDiagnosticDraft,
  error: unknown,
  server: McpServerConfig
): void {
  const message = _safeErrorMessage(error, server);
  _failDiagnosticStep(
    diagnostic,
    "config",
    "Remote MCP configuration is invalid.",
    { detail: message }
  );
  _skipDiagnosticStep(
    diagnostic,
    "secrets",
    "Skipped after invalid configuration."
  );
  _skipDiagnosticStep(
    diagnostic,
    "transport",
    "Skipped after invalid configuration."
  );
  _skipDiagnosticStep(
    diagnostic,
    "initialize",
    "Skipped after invalid configuration."
  );
  _skipDiagnosticStep(
    diagnostic,
    "listTools",
    "Skipped after invalid configuration."
  );
}

/**
 * Classifies failures from the SDK connect/initialize phase. It records whether
 * the transport failed before opening or opened but failed the MCP handshake.
 */
function _markConnectFailure(
  diagnostic: McpDiagnosticDraft,
  error: unknown,
  server: McpServerConfig
): void {
  const category = _classifyMcpError(error);
  const message = _safeErrorMessage(error, server);
  const guidance = _categoryGuidance(category, server);
  const detail = [message, guidance].filter(Boolean).join(" ");
  if (category === "protocol" || category === "unknown") {
    _passDiagnosticStep(diagnostic, "transport", "Transport opened.");
    _failDiagnosticStep(
      diagnostic,
      "initialize",
      "MCP initialization failed.",
      { detail }
    );
  } else {
    _failDiagnosticStep(
      diagnostic,
      "transport",
      "Transport connection failed.",
      {
        detail,
      }
    );
    _skipDiagnosticStep(
      diagnostic,
      "initialize",
      "Skipped because the transport did not open."
    );
  }
  _skipDiagnosticStep(
    diagnostic,
    "listTools",
    "Skipped after connection failure."
  );
}

/**
 * Freezes the mutable draft into the persisted diagnostic. It appends the final
 * result phase, keeps only redacted step data, and derives the copyable summary.
 */
function _finishDiagnostic(
  diagnostic: McpDiagnosticDraft,
  options: {
    outcome: McpDiagnosticOutcome;
    category: McpDiagnosticCategory;
    headline: string;
  }
) {
  _setDiagnosticStep(diagnostic, "result", {
    status: options.outcome,
    message: options.headline,
  });
  const result = {
    outcome: options.outcome,
    category: options.category,
    checkedAt: diagnostic.checkedAt,
    transport: diagnostic.transport,
    endpoint: diagnostic.endpoint,
    headline: options.headline,
    steps: diagnostic.steps,
    summary: "",
  };
  return {
    ...result,
    summary: _diagnosticSummary(result),
  };
}

/**
 * Builds the issue-report text shown by Copy Diagnostic Summary. Inputs must
 * already be redacted; this helper adds no raw headers or request bodies.
 */
function _diagnosticSummary(diagnostic: {
  outcome: McpDiagnosticOutcome;
  category: McpDiagnosticCategory;
  checkedAt: number;
  transport: McpRemoteTransportType;
  endpoint?: string;
  headline: string;
  steps: McpDiagnosticStep[];
}): string {
  const lines = [
    `MCP diagnostic: ${diagnostic.headline}`,
    `Outcome: ${diagnostic.outcome}`,
    `Category: ${diagnostic.category}`,
    `Transport: ${_transportLabel(diagnostic.transport)}`,
  ];
  if (diagnostic.endpoint) {
    lines.push(`Endpoint: ${diagnostic.endpoint}`);
  }
  lines.push(`Checked: ${new Date(diagnostic.checkedAt).toISOString()}`);
  lines.push("Steps:");
  for (const step of diagnostic.steps) {
    lines.push(`- ${step.label}: ${step.status} - ${step.message}`);
    if (step.detail) {
      lines.push(`  ${step.detail}`);
    }
  }
  return lines.join("\n");
}

/**
 * Converts a diagnostic category into user-facing recovery copy. Passing the
 * category avoids losing deliberate list-tools classification to a raw SDK error.
 */
function _diagnosticHeadline(
  error: unknown,
  server: McpServerConfig,
  category: McpDiagnosticCategory = _classifyMcpError(error)
): string {
  switch (category) {
    case "missingSecret":
      return _safeErrorMessage(error, server);
    case "timeout":
      return "Remote MCP test timed out. Check whether the server is running and reachable.";
    case "unreachable":
      return "Unable to reach the remote MCP endpoint. Check the URL and network access.";
    case "unauthorized":
      return "Authorization failed. Check the bearer token or required headers.";
    case "httpStatus": {
      const code = _errorCode(error);
      return code && code > 0
        ? `Remote MCP endpoint returned HTTP ${code}. Check the endpoint path and transport.`
        : "Remote MCP endpoint returned an HTTP error. Check the endpoint path and transport.";
    }
    case "transportMismatch":
      return "Remote MCP transport did not match this server configuration.";
    case "protocol":
      return "Remote MCP protocol handshake failed. Check that this endpoint serves MCP.";
    case "listTools":
      return "Connected to the MCP server, but listing tools failed.";
    case "invalidConfig":
      return "Remote MCP configuration is invalid.";
    case "unknown":
      return _safeErrorMessage(error, server);
    case "success":
      return "MCP server connected.";
  }
}

/**
 * Maps stable SDK and platform error shapes into the compact V1 taxonomy.
 * It intentionally falls back to unknown rather than exposing raw protocol data.
 */
function _classifyMcpError(error: unknown): McpDiagnosticCategory {
  const code = _errorCode(error);
  const text = _errorText(error).toLowerCase();
  if (text.includes("environment variable") && text.includes("is not set")) {
    return "missingSecret";
  }
  if (
    text.includes("invalid url") ||
    text.includes("url is invalid") ||
    text.includes("failed to parse url")
  ) {
    return "invalidConfig";
  }
  if (error instanceof UnauthorizedError || code === 401 || code === 403) {
    return "unauthorized";
  }
  if (error instanceof StreamableHTTPError || error instanceof SseError) {
    if (code === 404 || code === 405 || code === 406 || code === 415) {
      return "transportMismatch";
    }
  }
  if (
    text.includes("json-rpc") ||
    text.includes("initialize") ||
    text.includes("unexpected content type") ||
    text.includes("unsupported content-type") ||
    text.includes("invalid content-type") ||
    text.includes("not valid json") ||
    text.includes("unexpected token")
  ) {
    return "protocol";
  }
  if (error instanceof StreamableHTTPError || error instanceof SseError) {
    if (code !== undefined && code > 0) {
      return "httpStatus";
    }
  }
  if (
    text.includes("timed out") ||
    text.includes("timeout") ||
    text.includes("aborted")
  ) {
    return "timeout";
  }
  if (
    text.includes("fetch failed") ||
    text.includes("failed to fetch") ||
    text.includes("econnrefused") ||
    text.includes("enotfound") ||
    text.includes("econnreset") ||
    text.includes("network") ||
    text.includes("unable to connect")
  ) {
    return "unreachable";
  }
  if (text.includes("list tools") || text.includes("tools/list")) {
    return "listTools";
  }
  return "unknown";
}

/**
 * Adds short recovery guidance for categories that commonly come from URL,
 * header, network, or protocol mistakes.
 */
function _categoryGuidance(
  category: McpDiagnosticCategory,
  server: McpServerConfig
): string {
  if (category === "unauthorized") {
    return "Confirm the Authorization header or required token environment variable.";
  }
  if (category === "transportMismatch") {
    return server.transport === "sse"
      ? "Confirm this is a legacy SSE endpoint and that its message endpoint is available."
      : "Confirm this URL is the Streamable HTTP MCP endpoint, usually a path such as /mcp.";
  }
  if (category === "httpStatus") {
    return "Confirm the endpoint path, transport type, and server-side routing.";
  }
  if (category === "unreachable" || category === "timeout") {
    return "Confirm the server is running and reachable from this computer.";
  }
  if (category === "protocol") {
    return "Confirm the endpoint returns MCP JSON-RPC responses for this transport.";
  }
  return "";
}

/**
 * Reads numeric SDK status codes without depending on a specific transport error
 * class. Returns undefined when the error shape is not status-like.
 */
function _errorCode(error: unknown): number | undefined {
  if (
    error &&
    typeof error === "object" &&
    typeof (error as { code?: unknown }).code === "number"
  ) {
    return (error as { code: number }).code;
  }
  return undefined;
}

/**
 * Walks a shallow cause chain so classification sees wrapped SDK errors while
 * avoiding verbose or secret-bearing raw objects.
 */
function _errorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth++) {
    parts.push(_errorMessage(current));
    if (typeof current === "object" && current !== null && "cause" in current) {
      current = (current as { cause?: unknown }).cause;
    } else {
      break;
    }
  }
  return parts.join(" ");
}

/**
 * Returns the remote endpoint origin and path only. Query strings are omitted so
 * copied diagnostics can identify the route without leaking tokens.
 */
function _safeEndpoint(server: McpServerConfig): string | undefined {
  if (server.transport === "stdio" || !server.url) {
    return undefined;
  }
  try {
    const url = new URL(server.url);
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

/**
 * Narrows MCP transports to the remote transports covered by diagnostics V1.
 */
function _isRemoteTransport(
  transport: McpServerConfig["transport"]
): transport is McpRemoteTransportType {
  return transport === "streamableHttp" || transport === "sse";
}

/**
 * Formats transport names for diagnostic copy and summaries.
 */
function _transportLabel(transport: McpServerConfig["transport"]): string {
  if (transport === "streamableHttp") {
    return "Streamable HTTP";
  }
  if (transport === "sse") {
    return "SSE";
  }
  return "stdio";
}

function _normalizeReadiness(
  readiness: z.infer<typeof readinessSchema>
): McpServerReadiness {
  return {
    status: readiness.status,
    testedAt: readiness.testedAt,
    toolCount: readiness.toolCount,
    lastError: readiness.lastError,
    tools: (readiness.tools ?? []).map((tool) => ({
      ...tool,
      inputSchema: tool.inputSchema as McpToolSummary["inputSchema"],
      requiredFields: tool.requiredFields ?? [],
      topLevelProperties: tool.topLevelProperties ?? [],
    })),
    diagnostic: _normalizeDiagnostic(readiness.diagnostic),
  };
}

/**
 * Drops stale stdio diagnostics from older local WIP configs. Persisted remote
 * diagnostics pass through unchanged after the transport is narrowed.
 */
function _normalizeDiagnostic(
  diagnostic: z.infer<typeof diagnosticSchema> | undefined
): McpServerDiagnostic | undefined {
  if (!diagnostic || !_isRemoteTransport(diagnostic.transport)) {
    return undefined;
  }
  return {
    ...diagnostic,
    transport: diagnostic.transport,
  };
}

function _markReadinessStale(
  readiness: McpServerReadiness,
  serverName: string,
  useOriginalToolNames = false
): McpServerReadiness {
  return {
    ...readiness,
    status: "stale",
    lastError: undefined,
    diagnostic: undefined,
    tools: readiness.tools.map((tool) => ({
      ...tool,
      directName: buildMcpToolName({
        serverName,
        toolName: tool.normalizedToolName,
        useOriginalToolNames,
      }),
    })),
  };
}

function _toToolSummary(tool: McpToolView): McpToolSummary {
  return {
    toolName: tool.toolName,
    normalizedToolName: tool.normalizedToolName,
    directName: tool.directName,
    description: tool.description,
    inputSchema: tool.inputSchema,
    requiredFields: tool.requiredFields,
    topLevelProperties: tool.topLevelProperties,
    available: tool.available,
    disabledReason: tool.disabledReason,
  };
}

function _summarizeInputSchema(inputSchema: unknown): {
  requiredFields: string[];
  topLevelProperties: string[];
} {
  if (!inputSchema || typeof inputSchema !== "object") {
    return { requiredFields: [], topLevelProperties: [] };
  }
  const schema = inputSchema as {
    required?: unknown;
    properties?: unknown;
  };
  const requiredFields = Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === "string")
    : [];
  const topLevelProperties =
    schema.properties && typeof schema.properties === "object"
      ? Object.keys(schema.properties)
      : [];
  return { requiredFields, topLevelProperties };
}

function _cleanRecord(
  value: Record<string, string> | undefined
): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value ?? {})) {
    const trimmedKey = key.trim();
    if (trimmedKey) {
      result[trimmedKey] = item;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Hashes only plugin-owned connection configuration. Runtime readiness is
 * deliberately excluded so persisting a test result does not look like a
 * plugin configuration change. The cache stores this digest, never a second
 * copy of plugin headers or environment values.
 */
function _serverConfigFingerprint(server: McpServerConfig): string {
  const config = {
    id: server.id,
    name: server.name,
    serverName: server.serverName,
    useOriginalToolNames: server.useOriginalToolNames === true,
    transport: server.transport,
    command: server.command,
    args: server.args,
    cwd: server.cwd,
    env: _sortedRecord(server.env),
    url: server.url,
    headers: _sortedRecord(server.headers),
  };
  return createHash("sha256").update(JSON.stringify(config)).digest("hex");
}

function _sortedRecord(
  value: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!value) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
  );
}

function _resolveValue(value: string): string {
  return value.replace(
    ENV_REFERENCE_PATTERN,
    (_match: string, braced: string | undefined, bare: string | undefined) => {
      const name = braced ?? bare;
      if (!name) {
        return "";
      }
      const resolved = process.env[name];
      if (resolved === undefined) {
        throw new Error(`Environment variable ${name} is not set.`);
      }
      return resolved;
    }
  );
}

function _headersToRecord(
  headers: HeadersInit | undefined
): Record<string, string> {
  if (!headers) {
    return {};
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return headers;
}

function _errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function _safeErrorMessage(
  error: unknown,
  server: McpServerConfig | undefined
): string {
  const secrets = server
    ? _secretCandidates([
        ...Object.values(server.env ?? {}),
        ...Object.values(server.headers ?? {}),
      ])
    : [];
  return _redactErrorMessage(_errorMessage(error), secrets);
}

function _secretCandidates(values: string[]): string[] {
  const secrets = new Set<string>();
  for (const value of values) {
    if (value && !value.startsWith("$")) {
      secrets.add(value);
    }
    for (const match of value.matchAll(ENV_REFERENCE_PATTERN)) {
      const name = match[1] ?? match[2];
      if (!name) {
        continue;
      }
      const resolved = process.env[name];
      if (resolved) {
        secrets.add(resolved);
      }
    }
  }
  return [...secrets];
}

function _redactErrorMessage(message: string, secrets: string[]): string {
  let result = message;
  for (const secret of secrets) {
    if (!secret) {
      continue;
    }
    result = result.split(secret).join("[redacted]");
  }
  result = result.replace(/https?:\/\/[^\s?#]+(?:\?[^\s#]*)?/g, (urlText) => {
    try {
      const url = new URL(urlText);
      return `${url.origin}${url.pathname}`;
    } catch {
      return urlText.split("?")[0] ?? urlText;
    }
  });
  result = result.replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]");
  result = result.replace(
    /\b(authorization|cookie|token|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi,
    "$1=[redacted]"
  );
  return result;
}

function _flattenToolResult(result: CallToolResult): McpCallToolResponse {
  const parts: string[] = [];
  for (const content of result.content ?? []) {
    if (content.type === "text") {
      parts.push(content.text);
    } else if (content.type === "image") {
      parts.push(`[image: ${content.mimeType}, ${content.data.length} bytes]`);
    } else if (content.type === "audio") {
      parts.push(`[audio: ${content.mimeType}, ${content.data.length} bytes]`);
    } else if (content.type === "resource") {
      if ("text" in content.resource) {
        parts.push(
          `[resource: ${content.resource.uri}]\n${content.resource.text}`
        );
      } else {
        parts.push(
          `[resource: ${content.resource.uri}, ${content.resource.mimeType ?? "unknown"}, ${content.resource.blob.length} bytes]`
        );
      }
    } else if (content.type === "resource_link") {
      parts.push(`[resource link: ${content.name}] ${content.uri}`);
    }
  }
  if (result.structuredContent) {
    parts.push(JSON.stringify(result.structuredContent, null, 2));
  }
  const text = parts.join("\n\n").trim();
  const truncatedText =
    text.length > MAX_OUTPUT_CHARS
      ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n\n[truncated]`
      : text;
  return {
    content: [{ type: "text", text: truncatedText }],
    isError: result.isError,
  };
}
