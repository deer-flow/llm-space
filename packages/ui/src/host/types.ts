/**
 * The host-capability interfaces the Thread Playground depends on. In the
 * desktop app these are backed by Electrobun RPC; a web build supplies no-op /
 * static implementations. Keeping them as injected interfaces is what lets the
 * same UI render in both contexts.
 */

import type {
  AgentTransport,
  BuiltinTool,
  CustomModel,
  McpServerToolsResponse,
  McpServerView,
  McpTool,
  ModelConfig,
  ModelProviderGroup,
  SearchSettings,
  SkillInfo,
  SkillsSettings,
} from "@llm-space/core";

/** A tool call's result, normalized across the built-in and MCP backends. */
export interface ToolCallResult {
  contentText: string;
  isError: boolean;
}

/** Invoke an executable tool (built-in or MCP). */
export type ExecuteTool = (
  tool: McpTool | BuiltinTool,
  args: Record<string, unknown>
) => Promise<ToolCallResult>;

/** Read-only skills access used by prompt variables + examples. */
export interface SkillsHost {
  getSettings(): Promise<SkillsSettings>;
  listSkills(path: string): Promise<SkillInfo[]>;
}

/** Read-only MCP access used by the tool-import UI. */
export interface McpHost {
  listServers(): Promise<McpServerView[]>;
  listTools(serverId: string): Promise<McpServerToolsResponse>;
}

/** Built-in tool listing + OS reveal actions. */
export interface BuiltinToolsHost {
  list(): Promise<BuiltinTool[]>;
  /** Reveal an absolute path in the OS file manager; false if it was missing. */
  revealAbsolutePath(path: string): Promise<boolean>;
  /** Open an absolute path with the OS default handler (a folder opens itself). */
  openAbsolutePath(path: string): Promise<boolean>;
  /** Reveal a skill's SKILL.md by name; false if not found. */
  revealSkill(name: string): Promise<boolean>;
}

/** Workspace path resolution (used to seed example threads). */
export interface PathsHost {
  ensureRootDir(relativePath: string): Promise<string>;
}

/** Arbitrary text-file reads + native file picking for prompt variables. */
export interface FilesHost {
  /** Read a file's UTF-8 contents (`~` expands to home); `""` when missing. */
  readText(path: string): Promise<string>;
  /**
   * Open the native OS file picker; resolves to the chosen absolute path, or
   * `null` when cancelled / unavailable (e.g. the display-only web viewer).
   */
  pickFile(): Promise<string | null>;
}

/**
 * Filesystem/exec backing for the code Generator ("export this thread as a
 * runnable project"). Writes/exec are scoped to a directory the user picks via
 * {@link pickDirectory}. `null` on hosts without it (the web viewer).
 */
export interface GeneratorHost {
  /**
   * Open the native folder picker for the project's PARENT directory. `path` is
   * `null` on cancel; the wizard combines it with the project name.
   */
  pickDirectory(): Promise<{ path: string | null }>;
  /**
   * Resolve `parentDir/projectName`, validate it can hold a fresh project,
   * create it, and authorize it for the generator's writes + `uv` runs. The
   * wizard's "Next" gate on the directory step.
   */
  prepareDirectory(
    parentDir: string,
    projectName: string
  ): Promise<{ ok: true; dir: string } | { ok: false; error: string }>;
  /** Whether `uv` is installed on the host, and its version when detectable. */
  checkUv(): Promise<{ installed: boolean; version?: string }>;
  /** Run `uv <args>` with cwd = an authorized project directory. */
  runUv(
    rootDir: string,
    args: string[]
  ): Promise<{ code: number; stdout: string; stderr: string }>;
  /** Write a UTF-8 file under an authorized project directory. */
  writeFile(
    rootDir: string,
    relativePath: string,
    contents: string
  ): Promise<void>;
  /** Delete a file under an authorized project directory; no-op when missing. */
  removeFile(rootDir: string, relativePath: string): Promise<void>;
  /** The user's web-search settings, written into a generated project's `.env`. */
  getSearchSettings(): Promise<SearchSettings>;
  /**
   * Resolve the model provider's real API key plus the values of the named
   * environment variables — used to write a `.env` with the user's actual
   * secrets when they opt in.
   */
  resolveEnv(
    providerId: string,
    envNames: string[]
  ): Promise<{ modelApiKey: string; envValues: Record<string, string> }>;
}

/**
 * Host navigation, replacing the desktop command bus. On web these are no-ops
 * (or `openLink` → `window.open`). `registerRunThread` wires the playground's
 * run action into a host command palette / shortcut and returns a disposer.
 */
export interface HostActions {
  /** Open the host's settings surface on a tab (e.g. "models", "mcp", "search"). */
  openSettings(tab: string): void;
  openLink(url: string): void;
  /**
   * Open the host's Share surface for a thread. `path` targets a specific
   * thread; omitting it shares the active thread. No-op on web (presentational).
   */
  shareThread(path?: string): void;
  /** Request opening the variables dialog (handled within the playground). */
  openVariables(variableName?: string): void;
  /** Register the variables-dialog opener; returns a disposer. No-op on web. */
  registerOpenVariables(
    handler: (variableName?: string) => void
  ): () => void;
  /** Register the run-thread action for the host palette/shortcut; disposer. */
  registerRunThread(run: () => void): () => void;
}

/**
 * The full set of host capabilities. `transport`/`executeTool` are `null` in a
 * display-only (`presentational`) host; the playground gates edit/run chrome on
 * `presentational`.
 */
export interface HostServices {
  /** Display-only: hide all action chrome and non-Preview dialogs. */
  presentational: boolean;
  transport: AgentTransport | null;
  executeTool: ExecuteTool | null;
  skills: SkillsHost;
  mcp: McpHost;
  builtinTools: BuiltinToolsHost;
  paths: PathsHost;
  files: FilesHost;
  /** Code-generator backing; `null` on hosts without it (the web viewer). */
  generator: GeneratorHost | null;
  actions: HostActions;
}

/**
 * The model provider's RPC operations, injected into `ModelProvider` so the
 * React context/hooks stay framework-neutral. Desktop backs this with Electrobun
 * RPC; web supplies a static (empty) client.
 */
export interface ModelClient {
  availableModels(): Promise<ModelProviderGroup[]>;
  builtinProviders(): Promise<ModelProviderGroup[]>;
  getDefaultModel(): Promise<ModelConfig | null>;
  setDefaultModel(model: ModelConfig | null): Promise<ModelConfig | null>;
  removeProvider(providerId: string): Promise<ModelProviderGroup[]>;
  addProvider(providerId: string): Promise<ModelProviderGroup[]>;
  addCustomProvider(input: {
    id: string;
    name: string;
    baseUrl: string;
  }): Promise<ModelProviderGroup[]>;
  updateProvider(
    providerId: string,
    fields: {
      apiKey?: string | null;
      baseUrl?: string | null;
      headers?: Record<string, string> | null;
      name?: string | null;
      api?:
        | "anthropic-messages"
        | "openai-completions"
        | "openai-responses"
        | null;
      icon?: string | null;
    }
  ): Promise<ModelProviderGroup[]>;
  setModelEnabled(
    providerId: string,
    modelId: string,
    enabled: boolean
  ): Promise<ModelProviderGroup[]>;
  setAllModelsEnabled(
    providerId: string,
    enabled: boolean
  ): Promise<ModelProviderGroup[]>;
  testModelConnection(
    providerId: string,
    modelId: string,
    candidate?: CustomModel
  ): Promise<void>;
  removeCustomModel(
    providerId: string,
    modelId: string
  ): Promise<ModelProviderGroup[]>;
  upsertCustomModel(
    providerId: string,
    model: CustomModel,
    originalId?: string
  ): Promise<ModelProviderGroup[]>;
}
