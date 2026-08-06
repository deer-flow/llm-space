import { describe, expect, test } from "bun:test";

import type { PluginCommandExecutionResult } from "@llm-space/core";

import type {
  PluginCommandFeedback,
  PluginCommandRunInput,
} from "./plugin-command-execution";
import { PluginCommandExecutionManager } from "./plugin-command-execution";

describe("PluginCommandExecutionManager", () => {
  test("updates one feedback entry from running through phase and success", async () => {
    const calls: unknown[][] = [];
    const pending = Promise.withResolvers<PluginCommandExecutionResult>();
    const manager = _manager(calls, () => pending.promise);
    const executionId = manager.run(_input());
    manager.handleEvent({
      executionId,
      commandId: "plugin:demo:command:sync",
      type: "status",
      status: "running",
    });
    manager.handleEvent({
      executionId,
      commandId: "plugin:demo:command:sync",
      type: "phase",
      report: { phase: "download", message: "Downloading skills" },
    });
    manager.handleEvent({
      executionId,
      commandId: "plugin:demo:command:sync",
      type: "status",
      status: "succeeded",
      userMessage: { level: "success", message: "Synced 6 skills." },
    });
    pending.resolve({ result: null });
    await Bun.sleep(0);

    expect(calls).toEqual([
      ["loading", executionId, "Sync", "Running…"],
      ["loading", executionId, "Sync", "Downloading skills"],
      ["success", executionId, "Synced 6 skills.", "Sync"],
    ]);
  });

  test("shows generic completion for an ordinary result", async () => {
    const calls: unknown[][] = [];
    const manager = _manager(calls, () =>
      Promise.resolve({ result: "ignored" })
    );
    const executionId = manager.run(_input());
    await Bun.sleep(0);
    expect(calls).toEqual([
      ["success", executionId, "Command completed.", "Sync"],
    ]);
  });

  test("shows one error for a rejected request", async () => {
    const calls: unknown[][] = [];
    const manager = _manager(calls, () => Promise.reject(new Error("Broken")));
    const executionId = manager.run(_input());
    await Bun.sleep(0);
    expect(calls).toEqual([["error", executionId, "Broken", "Sync"]]);
  });

  test("replaces a Bun success with an active-tab commit failure", async () => {
    const calls: unknown[][] = [];
    const pending = Promise.withResolvers<PluginCommandExecutionResult>();
    const manager = _manager(calls, () => pending.promise);
    const input = _input();
    input.activeTab = {
      tabId: "tab-1",
      paneId: "pane-1",
      path: "thread.json",
      filename: "thread.json",
      runtimeId: "local",
      thread: {},
    };
    input.writeActiveTabThread = () => Promise.reject(new Error("Tab changed"));
    const executionId = manager.run(input);
    manager.handleEvent({
      executionId,
      commandId: "plugin:demo:command:sync",
      type: "status",
      status: "succeeded",
    });
    pending.resolve({
      result: null,
      activeTabThreadUpdate: {},
    });
    await Bun.sleep(0);

    expect(calls).toEqual([
      ["success", executionId, "Command completed.", "Sync"],
      ["error", executionId, "Tab changed", "Sync"],
    ]);
  });
});

function _manager(
  calls: unknown[][],
  request: () => Promise<PluginCommandExecutionResult>
) {
  const feedback = Object.fromEntries(
    ["loading", "success", "warning", "error"].map((level) => [
      level,
      (...args: unknown[]) => calls.push([level, ...args]),
    ])
  ) as unknown as PluginCommandFeedback;
  return new PluginCommandExecutionManager({
    request,
    feedback,
    createExecutionId: () => "execution-1",
  });
}

function _input(): PluginCommandRunInput {
  return {
    command: {
      id: "plugin:demo:command:sync",
      pluginId: "demo",
      displayName: "Sync",
    },
    activeTab: null,
    arguments: [],
    writeActiveTabThread: () => Promise.resolve(),
  };
}
