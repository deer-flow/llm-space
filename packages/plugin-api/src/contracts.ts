import type { JSONObject, JSONValue } from "./json";

export type PluginDiagnosticSeverity = "info" | "warning" | "error";

export interface PluginDiagnostic {
  pluginId: string;
  contributionId?: string;
  severity: PluginDiagnosticSeverity;
  code: string;
  message: string;
  metadata?: JSONObject;
  timestamp?: number;
}

/** Persisted, JSON-only runtime scope shared by plugin contributions. */
export interface PluginContext {
  contextId: string;
  pluginId: string;
  sourceId: string;
  schemaVersion: number;
  label: string;
  data: JSONObject;
  toolProviderId?: string;
  skillProviderId?: string;
}

export interface PluginToolDescriptor {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
  toolRef: string;
  contextId?: string;
}

export interface PluginSourceInput {
  kind: "path";
  path: string;
  origin?: "environment" | "user";
}

export interface PluginSourceProbeResult {
  confidence: number;
  diagnostics: PluginDiagnostic[];
}

export interface PluginSourceImportResult<TThread = unknown> {
  thread: TThread;
  contexts: PluginContext[];
  diagnostics: PluginDiagnostic[];
  suggestedWorkspaceFileName?: string;
}

export interface PluginToolCallResult {
  contentText: string;
  isError: boolean;
}

export interface PluginSkillSummary {
  name: string;
  description: string;
  resourceRef: string;
}

export interface PluginSkillContent {
  name: string;
  content: string;
  basePath?: string;
  metadata?: JSONObject;
}

export interface PluginOperationContext {
  signal: AbortSignal;
}

export interface PluginSourceImporter<TThread = unknown> {
  /** Probe a source without mutating source, workspace, or plugin storage. */
  probe?(
    source: PluginSourceInput,
    context: PluginOperationContext
  ): Promise<PluginSourceProbeResult>;

  /** Import a selected source into a native host-owned Thread representation. */
  importSource(
    source: PluginSourceInput,
    context: PluginOperationContext
  ): Promise<PluginSourceImportResult<TThread>>;
}

export interface PluginToolProvider {
  /** Resolve model-facing descriptors for one persisted plugin context. */
  listTools(
    context: PluginContext,
    operation: PluginOperationContext
  ): Promise<PluginToolDescriptor[]>;

  /** Execute one explicit manual call addressed by an opaque provider ref. */
  callTool(
    input: {
      context?: PluginContext;
      toolRef: string;
      arguments: JSONObject;
    },
    operation: PluginOperationContext
  ): Promise<PluginToolCallResult>;
}

export interface PluginSkillProvider {
  /** List project-scoped Skill summaries without reading full instructions. */
  listSkills(
    context: PluginContext,
    operation: PluginOperationContext
  ): Promise<PluginSkillSummary[]>;

  /** Read one scoped Skill by an opaque provider resource reference. */
  readSkill(
    input: { context: PluginContext; resourceRef: string },
    operation: PluginOperationContext
  ): Promise<PluginSkillContent | null>;
}

export interface PluginDevelopmentSeedRequest {
  sourceImporterId: string;
  source: PluginSourceInput;
  workspacePath?: string;
}

export interface PluginDevelopmentSeeder {
  /** Return explicit requests that the host routes through Source Importers. */
  seed(
    env: Readonly<Record<string, string | undefined>>,
    context: PluginOperationContext
  ): Promise<PluginDevelopmentSeedRequest[]>;
}

export interface PluginStorage {
  /** Read a JSON value from this plugin's private namespace. */
  read(key: string): Promise<JSONValue | undefined>;
  /** Atomically replace one JSON value in this plugin's private namespace. */
  write(key: string, value: JSONValue): Promise<void>;
  /** Remove one value from this plugin's private namespace. */
  remove(key: string): Promise<void>;
  /** List keys owned by this plugin. */
  list(): Promise<string[]>;
}

export interface PluginLogger {
  /** Emit a development log without persisting raw plugin payloads. */
  debug(message: string): void;
}

export interface PluginActivationContext {
  pluginId: string;
  storage: PluginStorage;
  logger: PluginLogger;
}

export interface PluginRegistrar<TThread = unknown> {
  /** Register a declared Source Importer contribution. */
  registerSourceImporter(
    id: string,
    importer: PluginSourceImporter<TThread>
  ): void;
  /** Register a declared Tool Provider contribution. */
  registerToolProvider(id: string, provider: PluginToolProvider): void;
  /** Register a declared Skill Provider contribution. */
  registerSkillProvider(id: string, provider: PluginSkillProvider): void;
  /** Register a declared Development Seeder contribution. */
  registerDevelopmentSeeder(id: string, seeder: PluginDevelopmentSeeder): void;
}

export interface PluginDefinition<TThread = unknown> {
  /** Register every runtime contribution declared by the static manifest. */
  activate(
    registrar: PluginRegistrar<TThread>,
    context: PluginActivationContext
  ): void | Promise<void>;

  /** Release plugin-owned runtime resources during disable or reload. */
  deactivate?(signal: AbortSignal): void | Promise<void>;

  /** Purely migrate a cloned persisted context to the current schema version. */
  migrateContext?(
    context: PluginContext,
    operation: PluginOperationContext
  ): PluginContext | Promise<PluginContext>;
}

/** Preserve inference while exposing one stable runtime-module contract. */
export function definePlugin<TThread = unknown>(
  definition: PluginDefinition<TThread>
): PluginDefinition<TThread> {
  return definition;
}
