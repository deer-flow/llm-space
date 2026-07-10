import type { JSONSchema, Thread, Tool } from "@llm-space/core";
import type { InstructionsDefinition as EveInstructionsDefinition } from "eve/instructions";
import type { SkillDefinition as EveSkillDefinition } from "eve/skills";
import type {
  ToolContext as EveToolContext,
  ToolDefinition as EveToolDefinition,
  ToolModelOutput as EveToolModelOutput,
} from "eve/tools";

export type {
  EveInstructionsDefinition,
  EveSkillDefinition,
  EveToolContext,
  EveToolDefinition,
  EveToolModelOutput,
};

export type EveDiagnosticLevel = "info" | "warning" | "error";

export interface EveDiagnostic {
  level: EveDiagnosticLevel;
  code: string;
  message: string;
  filePath?: string;
}

export interface EveProjectDetection {
  ok: boolean;
  projectRoot: string;
  agentDir: string;
  instructionsPath?: string;
  toolsDir?: string;
  skillsDir?: string;
  diagnostics: EveDiagnostic[];
}

export interface EveProjectImportOptions {
  projectRoot: string;
  source?: "env" | "manual";
}

export interface EveProjectImportResult {
  thread: Thread;
  diagnostics: EveDiagnostic[];
  project: EveProjectDetection;
}

export interface EveSkillInfo {
  name: string;
  description: string;
  path: string;
  enabled: true;
}

export interface EveSkillContent {
  frontmatters: Record<string, unknown>;
  content: string;
  path: string;
}

export interface EveToolCallInput {
  projectRoot: string;
  runtime: "tool" | "skill";
  toolName: string;
  toolPath?: string;
  arguments: Record<string, unknown>;
  abortSignal?: AbortSignal;
}

export interface EveToolCallResult {
  contentText: string;
  isError?: boolean;
}

export interface EveToolModule {
  default?: unknown;
}

export interface ParsedToolDescriptor {
  tool?: Tool;
  diagnostics: EveDiagnostic[];
}

export const EMPTY_OBJECT_SCHEMA: JSONSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
};
