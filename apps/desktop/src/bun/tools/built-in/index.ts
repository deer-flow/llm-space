import type { BuiltinTool } from "@llm-space/core";

import type { BuiltInToolGroup } from "@/shared/built-in-tools";

import { fsBuiltInTools } from "./fs";
import { miscBuiltInTools } from "./misc";
import { webBuiltInTools } from "./web";

export interface BuiltInToolEntry {
  tool: BuiltinTool;
  execute(args: Record<string, unknown>): Promise<unknown>;
}

export interface BuiltInToolCallResponse {
  contentText: string;
}

const BUILT_IN_TOOL_ENTRIES: BuiltInToolEntry[] = [
  ...webBuiltInTools,
  ...fsBuiltInTools,
  ...miscBuiltInTools,
];

const builtInToolsByName = _indexBuiltInTools(BUILT_IN_TOOL_ENTRIES);

export function listBuiltInTools(): BuiltinTool[] {
  return BUILT_IN_TOOL_ENTRIES.map((entry) => entry.tool);
}

export function listBuiltInToolGroups(): BuiltInToolGroup[] {
  return [
    {
      id: "fileSystem",
      label: "File system",
      tools: fsBuiltInTools.map((entry) => entry.tool),
    },
    {
      id: "web",
      label: "Web",
      tools: webBuiltInTools.map((entry) => entry.tool),
    },
    {
      id: "misc",
      label: "Misc",
      tools: miscBuiltInTools.map((entry) => entry.tool),
    },
  ];
}

export async function callBuiltInTool({
  name,
  arguments: args,
}: {
  name: string;
  arguments: Record<string, unknown>;
}): Promise<BuiltInToolCallResponse> {
  const entry = builtInToolsByName.get(name);
  if (!entry) {
    throw new Error(`Built-in tool not found: ${name}`);
  }
  const result = await entry.execute(args);
  return { contentText: _serializeToolResult(result) };
}

function _indexBuiltInTools(
  entries: BuiltInToolEntry[]
): Map<string, BuiltInToolEntry> {
  const result = new Map<string, BuiltInToolEntry>();
  for (const entry of entries) {
    const previous = result.get(entry.tool.name);
    if (previous) {
      throw new Error(`Duplicate built-in tool name: ${entry.tool.name}`);
    }
    result.set(entry.tool.name, entry);
  }
  return result;
}

function _serializeToolResult(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  return JSON.stringify(result, null, 2);
}
