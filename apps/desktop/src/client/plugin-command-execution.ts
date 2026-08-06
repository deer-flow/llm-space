import type {
  PluginCommandExecutionResult,
  PluginCommandUserMessage,
  PluginCommandView,
} from "@llm-space/core";

import type { PluginCommandExecutionEvent } from "../shared/rpc";

import type { PluginActiveTab } from "./plugins";

export interface PluginCommandFeedback {
  loading(id: string, title: string, description: string): void;
  success(id: string, message: string, commandName: string): void;
  warning(id: string, message: string, commandName: string): void;
  error(id: string, message: string, commandName: string): void;
}

export interface PluginCommandRunInput {
  command: PluginCommandView;
  activeTab: PluginActiveTab | null;
  arguments: string[];
  writeActiveTabThread(
    target: PluginActiveTab,
    thread: PluginActiveTab["thread"]
  ): Promise<void>;
}

interface PluginCommandExecutionDependencies {
  request(
    executionId: string,
    commandId: string,
    activeTab: Pick<PluginActiveTab, "filename" | "thread"> | null,
    args: string[]
  ): Promise<PluginCommandExecutionResult>;
  feedback: PluginCommandFeedback;
  createExecutionId(): string;
}

interface ActiveExecution {
  command: PluginCommandView;
  terminal: boolean;
}

export class PluginCommandExecutionManager {
  private readonly _executions = new Map<string, ActiveExecution>();

  constructor(
    private readonly _dependencies: PluginCommandExecutionDependencies
  ) {}

  run(input: PluginCommandRunInput): string {
    const executionId = this._dependencies.createExecutionId();
    this._executions.set(executionId, {
      command: input.command,
      terminal: false,
    });
    void this._request(executionId, input);
    return executionId;
  }

  handleEvent(event: PluginCommandExecutionEvent): void {
    const execution = this._executions.get(event.executionId);
    if (execution?.command.id !== event.commandId) return;
    if (execution.terminal) return;
    if (event.type === "phase") {
      this._dependencies.feedback.loading(
        event.executionId,
        execution.command.displayName,
        event.report.message?.trim() || event.report.phase
      );
      return;
    }
    if (event.status === "running") {
      this._dependencies.feedback.loading(
        event.executionId,
        execution.command.displayName,
        "Running…"
      );
      return;
    }
    this._terminal(
      event.executionId,
      execution,
      event.userMessage,
      event.status
    );
  }

  private async _request(
    executionId: string,
    input: PluginCommandRunInput
  ): Promise<void> {
    const execution = this._executions.get(executionId);
    if (!execution) return;
    try {
      const result = await this._dependencies.request(
        executionId,
        input.command.id,
        input.activeTab
          ? {
              filename: input.activeTab.filename,
              thread: input.activeTab.thread,
            }
          : null,
        input.arguments
      );
      if (result.activeTabThreadUpdate !== undefined) {
        if (!input.activeTab) {
          throw new Error("Plugin Command cannot write without an active tab.");
        }
        await input.writeActiveTabThread(
          input.activeTab,
          result.activeTabThreadUpdate
        );
      }
      if (!execution.terminal) {
        this._terminal(
          executionId,
          execution,
          result.userMessage,
          result.userMessage?.level === "error" ? "failed" : "succeeded"
        );
      }
    } catch (error) {
      this._terminal(
        executionId,
        execution,
        { level: "error", message: _errorMessage(error) },
        "failed"
      );
    } finally {
      this._executions.delete(executionId);
    }
  }

  private _terminal(
    executionId: string,
    execution: ActiveExecution,
    userMessage: PluginCommandUserMessage | undefined,
    status: "succeeded" | "failed"
  ): void {
    execution.terminal = true;
    const message =
      userMessage?.message ||
      (status === "succeeded" ? "Command completed." : "Command failed.");
    const level =
      userMessage?.level ?? (status === "succeeded" ? "success" : "error");
    this._dependencies.feedback[level](
      executionId,
      message,
      execution.command.displayName
    );
  }
}

function _errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
