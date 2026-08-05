import {
  ThreadZodSchema,
  type JsonValue,
  type PluginCommandExecutionResult,
  type PluginCommandInvocationContext,
  type PluginCommandView,
} from "@llm-space/core";

import type { PluginSubprocessHost } from "./plugin-subprocess-host";

interface Entry extends PluginCommandView {
  host: PluginSubprocessHost;
}

export type PluginOperationErrorHandler = (
  pluginId: string,
  stage: string,
  extensionId: string,
  error: unknown,
  output: string
) => Error;

export class PluginCommandRegistry {
  private readonly _entries = new Map<string, Entry>();

  constructor(private readonly _onError?: PluginOperationErrorHandler) {}

  replacePlugin(
    pluginId: string,
    host: PluginSubprocessHost | undefined,
    commands: Omit<PluginCommandView, "pluginId">[]
  ): void {
    this.removePlugin(pluginId);
    if (!host) return;
    for (const command of commands)
      this._entries.set(command.id, { ...command, pluginId, host });
  }

  removePlugin(pluginId: string): void {
    for (const [id, entry] of this._entries)
      if (entry.pluginId === pluginId) this._entries.delete(id);
  }

  list(): PluginCommandView[] {
    return [...this._entries.values()]
      .map((entry) => ({
        id: entry.id,
        pluginId: entry.pluginId,
        displayName: entry.displayName,
        description: entry.description,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async execute(id: string): Promise<JsonValue> {
    return (await this.executeWithContext(id, { activeTab: null }, []))
      .result;
  }

  async executeWithContext(
    id: string,
    context: PluginCommandInvocationContext,
    args: string[]
  ): Promise<PluginCommandExecutionResult> {
    const entry = this._entries.get(id);
    if (!entry) throw new Error(`Plugin command is unavailable: ${id}`);
    try {
      const response = await entry.host.call<PluginCommandExecutionResult>(
        "command.execute",
        { id, activeTab: context.activeTab, arguments: args }
      );
      return {
        result: response.result ?? null,
        ...(response.activeTabThreadUpdate === undefined
          ? {}
          : {
              activeTabThreadUpdate: ThreadZodSchema.parse(
                response.activeTabThreadUpdate
              ),
            }),
      };
    } catch (error) {
      throw (
        this._onError?.(
          entry.pluginId,
          "command-execute",
          id,
          error,
          entry.host.output
        ) ?? new Error("Plugin command failed.")
      );
    }
  }
}
