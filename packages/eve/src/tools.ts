import { readdirSync } from "node:fs";
import path from "node:path";

import type { EveTool, Tool } from "@llm-space/core";
import {
  isDisabledToolSentinel,
  isEnableWorkflowToolSentinel,
} from "eve/tools";

import { moduleUrl, realpath, resolveInside } from "./path-utils";
import { jsonSchemaFromEveInputSchema } from "./schema";
import { readEveProjectSkill } from "./skills";
import { createEveToolContext } from "./tool-context";
import { EMPTY_OBJECT_SCHEMA } from "./types";
import type {
  EveDiagnostic,
  EveToolCallInput,
  EveToolCallResult,
  EveToolDefinition,
  EveToolModelOutput,
  EveToolModule,
  ParsedToolDescriptor,
} from "./types";

const TOOL_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".mts"] as const;

type ImportedToolExport =
  | { kind: "tool"; definition: EveToolDefinition }
  | { kind: "disabled" }
  | { kind: "workflow" }
  | { kind: "unsupported" };

/**
 * Import all static Eve tools under `agent/tools/` into LLM Space tool
 * descriptors. Each file is imported directly so parameters come from the
 * exported `defineTool()` object, not from source parsing.
 */
export async function listEveProjectTools(
  projectRoot: string,
  toolsDir: string,
  diagnostics: EveDiagnostic[]
): Promise<Tool[]> {
  const tools: Tool[] = [];
  for (const entry of readdirSync(toolsDir, { withFileTypes: true })) {
    const extension = path.extname(entry.name);
    if (!entry.isFile() || !TOOL_EXTENSIONS.some((ext) => ext === extension)) {
      continue;
    }
    const toolPath = path.join(toolsDir, entry.name);
    const descriptor = await readEveToolDescriptor(projectRoot, toolPath);
    diagnostics.push(...descriptor.diagnostics);
    if (descriptor.tool) {
      tools.push(descriptor.tool);
    }
  }
  return tools.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Execute a manual Eve tool call. Normal tools import and call the project
 * tool module's `execute(input, ctx)` function; the scoped `skill` runtime
 * reads only this project's `agent/skills/`.
 */
export async function callEveTool(
  input: EveToolCallInput
): Promise<EveToolCallResult> {
  const projectRoot = realpath(input.projectRoot);
  if (input.runtime === "skill") {
    return _callScopedSkill(projectRoot, input.arguments);
  }

  const toolsDir = path.join(projectRoot, "agent", "tools");
  const toolPath = resolveInside(
    toolsDir,
    input.toolPath ?? path.join(toolsDir, `${input.toolName}.ts`)
  );
  const imported = await _importToolExport(toolPath);
  if (imported.kind !== "tool") {
    throw new Error(`Eve tool "${input.toolName}" does not export execute().`);
  }

  const result = await imported.definition.execute(
    input.arguments,
    createEveToolContext({ abortSignal: input.abortSignal })
  );
  const modelOutput =
    typeof imported.definition.toModelOutput === "function"
      ? await imported.definition.toModelOutput(result)
      : result;

  return { contentText: _stringifyToolResult(modelOutput), isError: false };
}

/**
 * Read one Eve tool descriptor from the direct module export.
 */
export async function readEveToolDescriptor(
  projectRoot: string,
  toolPath: string
): Promise<ParsedToolDescriptor> {
  const diagnostics: EveDiagnostic[] = [];
  const toolName = path.basename(toolPath, path.extname(toolPath));

  let imported: ImportedToolExport;
  try {
    imported = await _importToolExport(toolPath);
  } catch (error) {
    diagnostics.push({
      level: "warning",
      code: "tool_import_failed",
      message: `Could not import Eve tool "${toolName}": ${
        error instanceof Error ? error.message : String(error)
      }`,
      filePath: toolPath,
    });
    return { diagnostics };
  }

  if (imported.kind === "disabled") {
    diagnostics.push({
      level: "info",
      code: "tool_disabled",
      message: `Eve tool "${toolName}" exports disableTool() and was skipped.`,
      filePath: toolPath,
    });
    return { diagnostics };
  }
  if (imported.kind === "workflow") {
    diagnostics.push({
      level: "info",
      code: "workflow_tool_unsupported",
      message:
        "Eve workflow tools need Eve's orchestration runtime and are not imported into LLM Space V1.",
      filePath: toolPath,
    });
    return { diagnostics };
  }
  if (imported.kind === "unsupported") {
    diagnostics.push({
      level: "warning",
      code: "unsupported_tool_export",
      message:
        "Eve tool module did not default-export a defineTool() object with description, inputSchema, and execute.",
      filePath: toolPath,
    });
    return { diagnostics };
  }

  const schema = jsonSchemaFromEveInputSchema(imported.definition.inputSchema);
  if (!schema) {
    diagnostics.push({
      level: "warning",
      code: "unsupported_tool_schema",
      message: `Eve tool "${toolName}" has no readable inputSchema on its exported tool object; using an empty object schema.`,
      filePath: toolPath,
    });
  }

  return {
    tool: {
      type: "eve",
      runtime: "tool",
      name: toolName,
      description: imported.definition.description,
      parameters: schema ?? EMPTY_OBJECT_SCHEMA,
      projectRoot,
      toolName,
      toolPath,
    },
    diagnostics,
  };
}

/**
 * Create the project-scoped skill loader shown as an Eve tool.
 */
export function createScopedSkillTool(projectRoot: string): EveTool {
  return {
    type: "eve",
    runtime: "skill",
    name: "skill",
    description:
      "Load a skill from this Eve project's agent/skills directory. Global LLM Space skills are not available in this Eve environment.",
    strict: true,
    parameters: {
      type: "object",
      required: ["name"],
      properties: {
        name: {
          type: "string",
          description: "The Eve project skill name to load.",
        },
      },
      additionalProperties: false,
    },
    projectRoot,
    toolName: "skill",
  };
}

async function _importToolExport(toolPath: string): Promise<ImportedToolExport> {
  const mod = (await import(moduleUrl(toolPath))) as EveToolModule;
  const exported = mod.default;
  if (isDisabledToolSentinel(exported)) {
    return { kind: "disabled" };
  }
  if (isEnableWorkflowToolSentinel(exported)) {
    return { kind: "workflow" };
  }
  const definition = _asToolDefinition(exported);
  return definition ? { kind: "tool", definition } : { kind: "unsupported" };
}

function _asToolDefinition(value: unknown): EveToolDefinition | null {
  return value !== null &&
    typeof value === "object" &&
    "description" in value &&
    typeof value.description === "string" &&
    "inputSchema" in value &&
    "execute" in value &&
    typeof value.execute === "function"
    ? (value as EveToolDefinition)
    : null;
}

async function _callScopedSkill(
  projectRoot: string,
  args: Record<string, unknown>
): Promise<EveToolCallResult> {
  const name = typeof args.name === "string" ? args.name : "";
  if (!name) {
    throw new Error('Eve skill tool requires a string "name" argument.');
  }
  const found = await readEveProjectSkill(projectRoot, name);
  if (!found) {
    throw new Error(`Eve skill "${name}" not found in this project.`);
  }
  return {
    contentText: `Base directory for this skill: ${found.path}\n\n${found.content.trim()}`,
    isError: false,
  };
}

function _stringifyToolResult(value: unknown): string {
  if (_isEveToolModelOutput(value)) {
    return value.type === "text"
      ? value.value
      : JSON.stringify(value.value, null, 2);
  }
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return "";
  }
  return JSON.stringify(value, null, 2);
}

function _isEveToolModelOutput(value: unknown): value is EveToolModelOutput {
  return (
    value !== null &&
    typeof value === "object" &&
    "type" in value &&
    (value.type === "text" || value.type === "json") &&
    "value" in value
  );
}
