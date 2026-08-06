import { describe, expect, test } from "bun:test";

import type { PluginCommandExecutionResult } from "@llm-space/core";

import type { PluginCommandExecutionEvent } from "../../shared/rpc";

import { PluginCommandExecutionController } from "./plugin-command-execution-controller";

describe("PluginCommandExecutionController", () => {
  test("emits running, phase, and succeeded for one invocation", async () => {
    const events: PluginCommandExecutionEvent[] = [];
    const pending = Promise.withResolvers<PluginCommandExecutionResult>();
    const controller = new PluginCommandExecutionController({
      execute: () => pending.promise,
      send: (event) => events.push(event),
    });
    const execution = controller.execute(_input("execution-1", "command-1"));
    controller.report({
      executionId: "execution-1",
      commandId: "command-1",
      report: { phase: "download", message: "Downloading" },
    });
    pending.resolve({
      result: null,
      userMessage: { level: "success", message: "Synced" },
    });
    await execution;

    expect(events).toEqual([
      {
        executionId: "execution-1",
        commandId: "command-1",
        type: "status",
        status: "running",
      },
      {
        executionId: "execution-1",
        commandId: "command-1",
        type: "phase",
        report: { phase: "download", message: "Downloading" },
      },
      {
        executionId: "execution-1",
        commandId: "command-1",
        type: "status",
        status: "succeeded",
        userMessage: { level: "success", message: "Synced" },
      },
    ]);
  });

  test("treats an explicit error result as a controlled failure", async () => {
    const events: PluginCommandExecutionEvent[] = [];
    const controller = new PluginCommandExecutionController({
      execute: () =>
        Promise.resolve({
          result: null,
          userMessage: { level: "error", message: "Could not sync" },
        }),
      send: (event) => events.push(event),
    });

    expect(
      await controller.execute(_input("execution-1", "command-1"))
    ).toEqual({
      result: null,
      userMessage: { level: "error", message: "Could not sync" },
    });
    expect(events.at(-1)).toEqual({
      executionId: "execution-1",
      commandId: "command-1",
      type: "status",
      status: "failed",
      userMessage: { level: "error", message: "Could not sync" },
    });
  });

  test("emits one failed terminal event for thrown errors", async () => {
    const events: PluginCommandExecutionEvent[] = [];
    const controller = new PluginCommandExecutionController({
      execute: () => Promise.reject(new Error("Command broke")),
      send: (event) => events.push(event),
    });

    const error = await controller
      .execute(_input("execution-1", "command-1"))
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).toHaveProperty("message", "Command broke");
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      type: "status",
      status: "failed",
      userMessage: { level: "error", message: "Command broke" },
    });
  });

  test("rejects the same command concurrently but permits another command", async () => {
    const pending = new Map<
      string,
      (value: PluginCommandExecutionResult) => void
    >();
    const controller = new PluginCommandExecutionController({
      execute: (commandId) =>
        new Promise((resolve) => pending.set(commandId, resolve)),
      send: () => undefined,
    });
    const first = controller.execute(_input("execution-1", "command-1"));

    const duplicateError = await controller
      .execute(_input("execution-2", "command-1"))
      .catch((caught: unknown) => caught);
    expect(duplicateError).toBeInstanceOf(Error);
    expect(duplicateError).toHaveProperty(
      "message",
      "This Plugin Command is already running."
    );
    const other = controller.execute(_input("execution-3", "command-2"));
    pending.get("command-1")?.({ result: null });
    pending.get("command-2")?.({ result: null });
    await Promise.all([first, other]);
  });

  test("rejects reports for an inactive or mismatched invocation", () => {
    const controller = new PluginCommandExecutionController({
      execute: () => Promise.resolve({ result: null }),
      send: () => undefined,
    });
    expect(() =>
      controller.report({
        executionId: "missing",
        commandId: "command-1",
        report: { phase: "download" },
      })
    ).toThrow("does not match an active execution");
  });
});

function _input(executionId: string, commandId: string) {
  return {
    executionId,
    commandId,
    arguments: [],
    context: { activeTab: null },
  };
}
