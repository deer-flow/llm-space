import {
  ThreadZodSchema,
  type BuiltinToolCallResponse,
  type JsonValue,
  type PluginTool,
  type PluginToolExecutionResult,
  type Thread,
} from "@llm-space/core";

import type { PluginOperationErrorHandler } from "./plugin-command-registry";
import type { PluginSubprocessHost } from "./plugin-subprocess-host";

export interface LoadedPluginToolDefinition {
  id: string;
  name: string;
  description: string;
  parameters: PluginTool["parameters"];
  strict?: boolean;
}

interface Entry extends LoadedPluginToolDefinition {
  pluginId: string;
  host: PluginSubprocessHost;
}

export interface PluginToolInvocationContext {
  thread: Thread;
  variables: Record<string, JsonValue>;
}

/** Dynamic registry for Plugin-owned tools; unlike bundled tools it can reload. */
export class PluginToolRegistry {
  private readonly _entries = new Map<string, Entry>();

  constructor(private readonly _onError?: PluginOperationErrorHandler) {}

  replacePlugin(
    pluginId: string,
    host: PluginSubprocessHost | undefined,
    tools: LoadedPluginToolDefinition[]
  ): void {
    this.removePlugin(pluginId);
    if (!host) return;
    for (const tool of tools) {
      this._entries.set(tool.id, { ...tool, pluginId, host });
    }
  }

  removePlugin(pluginId: string): void {
    for (const [id, entry] of this._entries) {
      if (entry.pluginId === pluginId) this._entries.delete(id);
    }
  }

  list(): PluginTool[] {
    return [...this._entries.values()]
      .map((entry) => ({
        type: "plugin" as const,
        pluginId: entry.pluginId,
        toolId: entry.id,
        name: entry.name,
        description: entry.description,
        parameters: structuredClone(entry.parameters),
        ...(entry.strict === undefined ? {} : { strict: entry.strict }),
      }))
      .sort((left, right) =>
        left.pluginId === right.pluginId
          ? left.name.localeCompare(right.name)
          : left.pluginId.localeCompare(right.pluginId)
      );
  }

  async execute(
    tool: Pick<PluginTool, "pluginId" | "toolId">,
    context: PluginToolInvocationContext,
    args: Record<string, unknown>
  ): Promise<BuiltinToolCallResponse> {
    const entry = this._entries.get(tool.toolId);
    if (entry?.pluginId !== tool.pluginId) {
      throw new Error(
        `Plugin tool is unavailable: ${tool.pluginId}/${tool.toolId}`
      );
    }
    try {
      const response = await entry.host.call<PluginToolExecutionResult>(
        "tool.execute",
        {
          id: entry.id,
          thread: ThreadZodSchema.parse(context.thread),
          variables: structuredClone(context.variables),
          arguments: args,
        }
      );
      if (response.kind === "content") {
        return { content: response.content };
      }
      if (response.kind !== "value") {
        throw new Error("Plugin Tool returned an invalid result envelope.");
      }
      return {
        content: [
          {
            type: "text",
            text:
              typeof response.value === "string"
                ? response.value
                : JSON.stringify(response.value, null, 2),
          },
        ],
      };
    } catch (error) {
      throw (
        this._onError?.(
          entry.pluginId,
          "tool-execute",
          entry.id,
          error,
          entry.host.output
        ) ?? new Error("Plugin tool failed.")
      );
    }
  }
}
