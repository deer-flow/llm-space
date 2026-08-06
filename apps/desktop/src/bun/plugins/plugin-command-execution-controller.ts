import type {
  PluginCommandExecutionResult,
  PluginCommandInvocationContext,
  PluginCommandReport,
} from "@llm-space/core";

import type { PluginCommandExecutionEvent } from "../../shared/rpc";

export interface PluginCommandExecutionInput {
  executionId: string;
  commandId: string;
  arguments: string[];
  context: PluginCommandInvocationContext;
}

export interface PluginCommandReportInput {
  executionId: string;
  commandId: string;
  report: PluginCommandReport;
}

interface PluginCommandExecutionDependencies {
  execute(
    commandId: string,
    context: PluginCommandInvocationContext,
    args: string[],
    executionId: string
  ): Promise<PluginCommandExecutionResult>;
  send(event: PluginCommandExecutionEvent): void;
}

export class PluginCommandExecutionController {
  private readonly _commandExecutions = new Map<string, string>();
  private readonly _executionCommands = new Map<string, string>();

  constructor(
    private readonly _dependencies: PluginCommandExecutionDependencies
  ) {}

  async execute(
    input: PluginCommandExecutionInput
  ): Promise<PluginCommandExecutionResult> {
    const executionId = _identifier(input.executionId, "executionId");
    const commandId = _identifier(input.commandId, "commandId");
    if (this._executionCommands.has(executionId)) {
      throw new Error(
        `Plugin Command execution is already active: ${executionId}`
      );
    }
    if (this._commandExecutions.has(commandId)) {
      throw new Error("This Plugin Command is already running.");
    }

    this._executionCommands.set(executionId, commandId);
    this._commandExecutions.set(commandId, executionId);
    this._send({ executionId, commandId, type: "status", status: "running" });
    try {
      const result = await this._dependencies.execute(
        commandId,
        input.context,
        input.arguments,
        executionId
      );
      const controlledFailure = result.userMessage?.level === "error";
      this._send({
        executionId,
        commandId,
        type: "status",
        status: controlledFailure ? "failed" : "succeeded",
        ...(result.userMessage ? { userMessage: result.userMessage } : {}),
      });
      return result;
    } catch (error) {
      this._send({
        executionId,
        commandId,
        type: "status",
        status: "failed",
        userMessage: { level: "error", message: _errorMessage(error) },
      });
      throw error;
    } finally {
      this._executionCommands.delete(executionId);
      this._commandExecutions.delete(commandId);
    }
  }

  report(input: PluginCommandReportInput): void {
    const executionId = _identifier(input.executionId, "executionId");
    const commandId = _identifier(input.commandId, "commandId");
    if (this._executionCommands.get(executionId) !== commandId) {
      throw new Error(
        "Plugin Command report does not match an active execution."
      );
    }
    const report = _report(input.report);
    this._send({ executionId, commandId, type: "phase", report });
  }

  private _send(event: PluginCommandExecutionEvent): void {
    this._dependencies.send(event);
  }
}

function _identifier(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Plugin Command ${name} is required.`);
  }
  return value;
}

function _report(value: unknown): PluginCommandReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Plugin Command report is invalid.");
  }
  const report = value as Record<string, unknown>;
  if (typeof report.phase !== "string" || report.phase.trim().length === 0) {
    throw new Error("Plugin Command report phase is required.");
  }
  if (report.message !== undefined && typeof report.message !== "string") {
    throw new Error("Plugin Command report message must be a string.");
  }
  return {
    phase: report.phase,
    ...(report.message === undefined ? {} : { message: report.message }),
  };
}

function _errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
