import type { JSONSchema } from "./shared";

export type McpTransportType = "stdio" | "streamableHttp" | "sse";
export type McpRemoteTransportType = Exclude<McpTransportType, "stdio">;

export interface McpServerDraft {
  name: string;
  transport: McpTransportType;
  command?: string;
  args?: string[];
  cwd?: string | null;
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export type McpReadinessStatus = "untested" | "ready" | "error" | "stale";
export type McpDiagnosticOutcome = "passed" | "failed";
export type McpDiagnosticStepStatus = "passed" | "failed" | "skipped";
export type McpDiagnosticCategory =
  | "success"
  | "invalidConfig"
  | "missingSecret"
  | "unreachable"
  | "timeout"
  | "unauthorized"
  | "httpStatus"
  | "transportMismatch"
  | "protocol"
  | "listTools"
  | "unknown";

export interface McpDiagnosticStep {
  id: string;
  label: string;
  status: McpDiagnosticStepStatus;
  message: string;
  detail?: string;
}

export interface McpServerDiagnostic {
  outcome: McpDiagnosticOutcome;
  category: McpDiagnosticCategory;
  checkedAt: number;
  transport: McpRemoteTransportType;
  endpoint?: string;
  headline: string;
  steps: McpDiagnosticStep[];
  summary: string;
}

export interface McpToolSummary {
  toolName: string;
  normalizedToolName: string;
  directName: string;
  description: string;
  inputSchema: JSONSchema;
  requiredFields: string[];
  topLevelProperties: string[];
  available: boolean;
  disabledReason?: string;
}

export interface McpServerReadiness {
  status: McpReadinessStatus;
  testedAt?: number;
  toolCount: number | null;
  lastError?: string;
  tools: McpToolSummary[];
  diagnostic?: McpServerDiagnostic;
}

export interface McpServerConfig extends McpServerDraft {
  id: string;
  serverName: string;
  createdAt: number;
  updatedAt: number;
  readiness?: McpServerReadiness;
}

export interface McpServerView extends McpServerConfig {
  connected: boolean;
  toolCount: number | null;
  lastError?: string;
}

export interface McpToolView {
  serverId: string;
  serverName: string;
  serverDisplayName: string;
  toolName: string;
  normalizedToolName: string;
  directName: string;
  description: string;
  inputSchema: JSONSchema;
  requiredFields: string[];
  topLevelProperties: string[];
  available: boolean;
  disabledReason?: string;
}

export interface McpServerToolsResponse {
  server: McpServerView;
  tools: McpToolView[];
}

export interface McpCallToolResponse {
  contentText: string;
  isError?: boolean;
}

export interface McpServersConfig {
  servers: McpServerConfig[];
}

const MCP_NAME_CHARS = /[^A-Za-z0-9_]+/g;
const MCP_UNDERSCORES = /_+/g;

export function normalizeMcpName(value: string): string {
  return value
    .trim()
    .replace(MCP_NAME_CHARS, "_")
    .replace(MCP_UNDERSCORES, "_")
    .replace(/^_+|_+$/g, "");
}

export function buildMcpToolName({
  serverName,
  toolName,
}: {
  serverName: string;
  toolName: string;
}): string {
  return `mcp__${serverName}__${toolName}`;
}

export function getMcpReadinessLabel(
  readiness: McpServerReadiness | undefined
): string {
  if (!readiness || readiness.status === "untested") {
    return "Untested";
  }
  if (readiness.status === "ready") {
    return "Ready";
  }
  if (readiness.status === "stale") {
    return "Stale";
  }
  return "Error";
}
