import { describe, expect, test } from "bun:test";

import type {
  AgentStatusComponent,
  AgentStatusSnapshot,
} from "@llm-space/core";

import {
  buildAgentStatusBarItems,
  observeAgentStatusNow,
} from "../../../../src/components/thread-playground/agent-status/agent-status-bar";
import {
  AGENT_STATUS_COMPONENT_OPTIONS,
  AGENT_STATUS_TIME_PRESETS,
} from "../../../../src/components/thread-playground/agent-status/agent-status-options";

const ALL_COMPONENTS: AgentStatusComponent[] = [
  "timestamps",
  "tool-counter",
  "todos",
  "detailed-errors",
  "system",
];

const NOW = Date.UTC(2026, 7, 19, 6, 10, 20, 123);

const SNAPSHOT: Pick<
  AgentStatusSnapshot,
  | "now"
  | "toolCounts"
  | "todos"
  | "lastError"
  | "workingDirectory"
  | "environment"
> = {
  now: NOW,
  toolCounts: {
    read_file: 3,
    bash: 2,
    rewrite_todo_list: 1,
  },
  todos: [
    {
      id: "todo-1",
      content: "检查实现",
      status: "completed",
      timestamp: NOW - 3_000,
    },
    {
      id: "todo-2",
      content: "补充测试",
      status: "in_progress",
      timestamp: NOW - 2_000,
    },
    {
      id: "todo-3",
      content: "完成验收",
      status: "pending",
      timestamp: NOW - 1_000,
    },
  ],
  lastError: {
    type: "FileNotFoundError",
    description: "ENOENT: 找不到文件 missing.ts",
    argumentsJson: '{"path":"missing.ts"}',
    stack: "FileNotFoundError: ENOENT\n    at readFile",
    suggestions: ["请验证路径并检查当前工作目录"],
  },
  workingDirectory: "C:\\repo",
  environment: {
    currentTime: "2026-08-19T06:10:20.123Z",
    workingDirectory: "C:\\repo",
    platform: "win32",
    arch: "x64",
    shell: "PowerShell 7",
    pythonVersion: "Python 3.12.8",
  },
};

function _itemText(
  items: ReturnType<typeof buildAgentStatusBarItems>,
  id: (typeof ALL_COMPONENTS)[number]
): string {
  const item = items.find((candidate) => candidate.id === id);
  expect(item).toBeDefined();
  return JSON.stringify(item);
}

describe("agent status bar", () => {
  test("exposes the five selectable components in a stable order", () => {
    expect(AGENT_STATUS_COMPONENT_OPTIONS.map((option) => option.id)).toEqual(
      ALL_COMPONENTS
    );
  });

  test("offers real-time, yesterday, and tomorrow simulation presets", () => {
    expect(AGENT_STATUS_TIME_PRESETS).toEqual([
      { label: "实时", offsetMs: 0 },
      { label: "昨天", offsetMs: -86_400_000 },
      { label: "明天", offsetMs: 86_400_000 },
    ]);
  });

  test("observes current wall time without rebuilding the transcript snapshot", () => {
    expect(observeAgentStatusNow(NOW + 1_000, -86_400_000)).toBe(
      NOW + 1_000 - 86_400_000
    );
    expect(SNAPSHOT.now).toBe(NOW);
  });

  test("displays the visible clock in the selected local time zone", () => {
    const items = buildAgentStatusBarItems(SNAPSHOT, ["timestamps"], {
      timeZone: "Asia/Shanghai",
    });

    expect(_itemText(items, "timestamps")).toContain("2026-08-19 14:10:20");
    expect(_itemText(items, "timestamps")).not.toContain("06:10:20");
  });

  test("builds visible summaries for time, tool calls, todos, errors, and cwd", () => {
    const items = buildAgentStatusBarItems(SNAPSHOT, ALL_COMPONENTS, {
      timeZone: "Asia/Shanghai",
    });

    expect(items.map((item) => item.id)).toEqual(ALL_COMPONENTS);
    expect(_itemText(items, "timestamps")).toContain("2026-08-19 14:10:20");
    expect(_itemText(items, "tool-counter")).toContain("6");
    expect(_itemText(items, "todos")).toContain("1/3");
    expect(_itemText(items, "detailed-errors")).toContain("FileNotFoundError");
    expect(_itemText(items, "detailed-errors")).toContain(
      "请验证路径并检查当前工作目录"
    );
    expect(_itemText(items, "system")).toContain("C:\\\\repo");
    expect(_itemText(items, "system")).toContain("win32/x64");
    expect(_itemText(items, "system")).toContain("PowerShell 7");
    expect(_itemText(items, "system")).toContain("Python 3.12.8");
  });

  test.each(ALL_COMPONENTS)(
    "removes %s when the component is disabled",
    (id) => {
      const enabled = ALL_COMPONENTS.filter((component) => component !== id);
      const items = buildAgentStatusBarItems(SNAPSHOT, enabled);

      expect(items.some((item) => item.id === id)).toBe(false);
      expect(items.map((item) => item.id)).toEqual(enabled);
    }
  );
});
