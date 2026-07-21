import type {
  McpTransportType,
  ModelConfig,
  SearchSettings,
  ThreadContext,
} from "../types";
import type { WorkflowContext } from "../workflow";

/** Whether `uv` is available on the host, plus its version when known. */
export interface UvStatus {
  installed: boolean;
  version?: string;
}

/** Result of one `uv` invocation. */
export interface UvRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Host filesystem/exec capabilities a generator needs. Injected by the host
 * (desktop: Electrobun RPC), so this module stays UI- and Electrobun-free. All
 * writes/exec are scoped to `GeneratorRunInput.targetDir`, which the wizard has
 * already resolved, created, and authorized before `run()` is invoked.
 */
export interface GeneratorCapabilities {
  /** Whether `uv` is installed, and its version. */
  checkUv(): Promise<UvStatus>;
  /** Run `uv <args>` with cwd = `rootDir`. Rejects on a non-zero exit. */
  runUv(rootDir: string, args: string[]): Promise<UvRunResult>;
  /** Write a UTF-8 text file at `rootDir/relativePath`, creating parents. */
  writeFile(rootDir: string, relativePath: string, contents: string): Promise<void>;
  /** Delete `rootDir/relativePath` if it exists; a no-op when missing. */
  removeFile(rootDir: string, relativePath: string): Promise<void>;
}

/**
 * Provider/model facts the host resolves (from the configured provider + the
 * model catalog) so the generator can emit a runnable model factory without
 * knowing about the app's model system. `apiKey` is the raw stored value: a
 * `$NAME` reference reads `process.env.NAME`; any other value is a literal key.
 */
export interface GeneratorModelInfo {
  /** The model's display name (used to derive the API-key env-var name). */
  name: string;
  /** Resolved API endpoint (provider override, else the model default). */
  baseUrl?: string;
  /** Raw stored API key: `$ENV` references an env var; else a literal key. */
  apiKey?: string;
  /** The model uses the Anthropic Messages API — emit `ChatAnthropic`. */
  anthropic: boolean;
  /**
   * The model speaks the DeepSeek thinking format (served over an OpenAI-
   * compatible API) — emit `ChatDeepSeek` + `extra_body` rather than `ChatOpenAI`.
   */
  deepseekThinking: boolean;
  /** The model supports reasoning/thinking. */
  supportsReasoning: boolean;
}

/**
 * A configured MCP server, resolved by the host from `settings/mcp.json`, that
 * the thread's MCP tools connect through. A serializable subset of the app's
 * `McpServerConfig` — just the connection facts the generator needs to emit a
 * real `MultiServerMCPClient` config. `serverName` is the normalized segment in
 * the `mcp__{serverName}__{toolName}` convention (and the key in `MCP_SERVERS`).
 * Stdio servers carry `command`/`args`/`cwd`/`env`; remote (`streamableHttp`/
 * `sse`) servers carry `url`/`headers`. Secret-bearing values are never baked
 * into source — the generator routes them through `.env`.
 */
export interface GeneratorMcpServer {
  /** The server's stable id (joins the thread's `McpTool.serverId`). */
  id: string;
  /** Normalized server segment — the `MCP_SERVERS` dict key. */
  serverName: string;
  transport: McpTransportType;
  command?: string;
  args?: string[];
  cwd?: string | null;
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

/** An enabled skill resolved by the host: its name + absolute directory. */
export interface GeneratorSkill {
  name: string;
  /** Absolute path to the skill's directory (contains `SKILL.md`). */
  path: string;
}

/**
 * Everything a generator run needs, assembled by the host. `rendered` holds the
 * final system prompt + message strings (variables already resolved via
 * `renderThreadPromptVariables`); `context` is the raw thread context, used for
 * tool + variable metadata.
 */
export interface GeneratorRunInput {
  /**
   * Absolute path of the project directory — already created and authorized by
   * the wizard (directory selection happens before the run, not inside it).
   */
  targetDir: string;
  /** Raw thread context (tools, variables, unrendered templates). */
  context: ThreadContext;
  /** Pre-rendered, model-facing system prompt + messages. */
  rendered: ThreadContext;
  /**
   * The system prompt as a template (variable placeholders left intact,
   * `@include` macros already expanded) — rendered at runtime in the generated
   * project so `current_date`/`available_skills` stay live.
   */
  systemPromptTemplate: string;
  /** Enabled skills (name → absolute path), for `skill.py` + `available_skills`. */
  skills: GeneratorSkill[];
  /**
   * The MCP servers the thread's MCP tools connect through, resolved by the
   * host from settings. Used to emit a real `src/tools/mcp.py`. Absent/empty
   * when the thread has no MCP tools or the host can't resolve them.
   */
  mcpServers?: GeneratorMcpServer[];
  /**
   * Resolved values for the thread's variables (by name) — used to bake `file`
   * variable contents (and other pre-resolved values) into the project.
   */
  renderedVariableValues: Record<string, string>;
  /** Model used for the `agent()` PLAN-generation step. */
  model: ModelConfig;
  /** Provider/model facts for the generated model factory. */
  modelInfo: GeneratorModelInfo;
  /**
   * The user's web-search settings, written into `.env` when the thread uses
   * the built-in web tools. Absent when there are no web tools / no host access.
   */
  searchInfo?: SearchSettings;
  /** Host filesystem/exec capabilities. */
  capabilities: GeneratorCapabilities;
}

/** Outcome of a completed generator run. */
export interface GeneratorResult {
  /** Absolute path of the generated project directory. */
  dir: string;
  /** Project-relative paths written. */
  files: string[];
}

/**
 * A pluggable project generator: a dynamic-workflow script that turns the
 * current thread into a code project. `run` receives the workflow scripting
 * surface ({@link WorkflowContext}) and the assembled {@link GeneratorRunInput}.
 * Returns `null` when the user cancels (e.g. no directory picked).
 */
export interface GeneratorDefinition {
  id: string;
  label: string;
  run(
    workflow: WorkflowContext,
    input: GeneratorRunInput
  ): Promise<GeneratorResult | null>;
}
