import { Type, type Static } from "typebox";

import { JSONSchema } from "../shared";

const ToolBase = Type.Object({
  /**
   * The name of the tool exposed to the model.
   */
  name: Type.String(),

  /**
   * The description of the tool exposed to the model.
   */
  description: Type.String(),

  /**
   * A JSON schema representing the parameters of the tool.
   */
  parameters: JSONSchema,

  strict: Type.Optional(Type.Boolean()),
});

/**
 * The definition of a custom function tool.
 */
const FunctionTool = Type.Intersect([
  ToolBase,
  Type.Object({
    type: Type.Literal("function"),
  }),
]);
export type FunctionTool = Static<typeof FunctionTool>;

/**
 * The definition of a tool backed by an MCP server.
 */
const McpTool = Type.Intersect([
  ToolBase,
  Type.Object({
    type: Type.Literal("mcp"),
    /**
     * The configured MCP server id that owns the raw MCP tool.
     */
    serverId: Type.String(),
    /**
     * The normalized server segment used in `mcp__{serverName}__{toolName}`.
     */
    serverName: Type.String(),
    /**
     * The raw MCP tool name sent back to the server during `tools/call`.
     */
    toolName: Type.String(),
  }),
]);
export type McpTool = Static<typeof McpTool>;

/**
 * The definition of a tool backed by the desktop's built-in runtime registry.
 */
const BuiltinTool = Type.Intersect([
  ToolBase,
  Type.Object({
    type: Type.Literal("builtin"),
    /**
     * Stable icon key resolved to a Lucide icon on the renderer. Keeps the
     * built-in tool's icon defined alongside the tool itself (single source of
     * truth) instead of a name→icon lookup that drifts per UI surface.
     */
    icon: Type.Optional(Type.String()),
    /**
     * When `true`, the tool always ends the run and can never be auto-executed —
     * its result must be supplied by a human (e.g. `ask_user_question`). It is
     * excluded from {@link isExecutableTool} so neither the "auto run tools"
     * nor the ReAct-loop path will ever call it automatically.
     */
    terminate: Type.Optional(Type.Boolean()),
  }),
]);
export type BuiltinTool = Static<typeof BuiltinTool>;

/**
 * The definition of a tool routed through one registered plugin Tool Provider.
 * Provider-owned executable state stays behind the opaque `toolRef`; optional
 * context state lives once in the Thread's generic plugin context collection.
 */
const PluginTool = Type.Intersect([
  ToolBase,
  Type.Object({
    type: Type.Literal("plugin"),
    pluginId: Type.String(),
    providerId: Type.String(),
    toolRef: Type.String(),
    contextId: Type.Optional(Type.String()),
  }),
]);
export type PluginTool = Static<typeof PluginTool>;

export interface LegacyMcpToolSource {
  /**
   * The configured MCP server id that owns the raw MCP tool.
   */
  type: "mcp";
  serverId: string;
  /**
   * The normalized server segment used in `mcp__{serverName}__{toolName}`.
   */
  serverName: string;
  /**
   * The raw MCP tool name sent back to the server during `tools/call`.
   */
  toolName: string;
}

/**
 * The union type of the tools.
 */
export const Tool = Type.Union([
  FunctionTool,
  McpTool,
  BuiltinTool,
  PluginTool,
]);
export type Tool = FunctionTool | McpTool | BuiltinTool | PluginTool;

export type LegacyTool = Omit<FunctionTool, "type"> & {
  type?: "function";
  source?: LegacyMcpToolSource;
};

export function normalizeTool(tool: Tool | LegacyTool): Tool {
  if (
    tool.type === "mcp" ||
    tool.type === "builtin" ||
    tool.type === "plugin"
  ) {
    return tool;
  }
  const legacySource = _getLegacyMcpSource(tool);
  if (legacySource) {
    return {
      type: "mcp",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      ...(tool.strict === undefined ? {} : { strict: tool.strict }),
      serverId: legacySource.serverId,
      serverName: legacySource.serverName,
      toolName: legacySource.toolName,
    };
  }
  if (tool.type === "function" && !("source" in tool)) {
    return tool as FunctionTool;
  }
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    ...(tool.strict === undefined ? {} : { strict: tool.strict }),
  };
}

export function normalizeTools(tools: readonly (Tool | LegacyTool)[]): Tool[] {
  return tools.map(normalizeTool);
}

/**
 * Whether a tool has a runtime backend the app can invoke directly after an
 * explicit call. MCP tools call their server, built-in tools call the desktop
 * registry, and plugin tools call their registered Tool Provider; `function`
 * tools are user-defined stubs with no backend, so their results are supplied
 * by hand. Built-in tools flagged `terminate` (e.g. `ask_user_question`)
 * require human input, so they are treated as non-executable too.
 */
export function isExecutableTool(
  tool: Tool
): tool is McpTool | BuiltinTool | PluginTool {
  if (tool.type === "mcp") {
    return true;
  }
  if (tool.type === "plugin") {
    return true;
  }
  return tool.type === "builtin" && tool.terminate !== true;
}

/**
 * A conservative denylist of shell fragments that make a `bash` command too
 * destructive to run automatically (`rm`, `mkfs`, `dd of=…`, fork bombs,
 * writes to raw devices, pipe-to-shell installers, `sudo`, power state changes,
 * …). Detection is intentionally simple and substring/word based — it errs
 * toward flagging, since a false positive only means the user runs the command
 * by hand.
 */
const DANGEROUS_BASH_PATTERNS: RegExp[] = [
  /\brm\s+/i, // any rm, including rm -rf
  /\bmkfs\b/i, // format a filesystem
  /\bdd\b[^|]*\bof=/i, // dd writing to a device/file
  /:\s*\(\s*\)\s*\{.*\}\s*;/, // fork bomb :(){ :|:& };:
  /\b(shutdown|reboot|halt|poweroff)\b/i,
  /\bchmod\s+-R\b/i,
  /\bchown\s+-R\b/i,
  />\s*\/dev\/(sd|nvme|disk)/i, // overwrite a raw disk
  /\bsudo\b/i,
  /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(sh|bash|zsh)\b/i, // pipe-to-shell
];

/**
 * Whether a `bash` command is destructive enough that it must never be run
 * automatically. Used to keep such commands out of the auto-run / ReAct paths —
 * effectively treating the call as `terminate` — while still letting the user
 * execute it deliberately by hand.
 */
export function isDangerousBashCommand(command: string): boolean {
  return DANGEROUS_BASH_PATTERNS.some((pattern) => pattern.test(command));
}

function _getLegacyMcpSource(
  tool: Tool | LegacyTool
): LegacyMcpToolSource | undefined {
  if (!("source" in tool) || tool.source?.type !== "mcp") {
    return undefined;
  }
  return tool.source;
}
