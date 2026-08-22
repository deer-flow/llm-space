"use client";

import {
  type AgentStatusComponent,
  type AgentStatusSnapshot,
} from "@llm-space/core";
import { useEffect, useState } from "react";

import { Tooltip } from "../../tooltip";
import { useThreadStore } from "../stores";

export function observeAgentStatusNow(
  wallTime: number,
  simulatedTimeOffsetMs: number
): number {
  return wallTime + simulatedTimeOffsetMs;
}

export interface AgentStatusBarItem {
  id: AgentStatusComponent;
  label: string;
  value: string;
  description?: string;
}

export interface AgentStatusBarBuildOptions {
  timeZone?: string;
}

export interface AgentStatusBarProps {
  /** 默认使用当前操作系统向渲染器报告的本地时区。 */
  timeZone?: string;
  /** 注入墙钟便于稳定验证，生产环境默认使用 Date.now。 */
  now?: () => number;
}

type AgentStatusBarSnapshot = Pick<
  AgentStatusSnapshot,
  | "now"
  | "toolCounts"
  | "todos"
  | "lastError"
  | "workingDirectory"
  | "environment"
>;

export function buildAgentStatusBarItems(
  snapshot: AgentStatusBarSnapshot,
  enabled: readonly AgentStatusComponent[],
  options: AgentStatusBarBuildOptions = {}
): AgentStatusBarItem[] {
  const selected = new Set(enabled);
  const toolCallTotal = Object.values(snapshot.toolCounts).reduce(
    (total, count) => total + count,
    0
  );
  const completedTodos = snapshot.todos.filter(
    (todo) => todo.status === "completed"
  ).length;
  const lastError = snapshot.lastError;
  const errorSuggestions = lastError?.suggestions ?? [];
  const candidates: AgentStatusBarItem[] = [
    {
      id: "timestamps",
      label: "时间",
      value: formatAgentStatusLocalTime(snapshot.now, options.timeZone),
    },
    {
      id: "tool-counter",
      label: "工具调用",
      value: String(toolCallTotal),
      description: Object.entries(snapshot.toolCounts)
        .map(([name, count]) => `${name}: ${count}`)
        .join("\n"),
    },
    {
      id: "todos",
      label: "TODO",
      value: `${completedTodos}/${snapshot.todos.length}`,
      description: snapshot.todos
        .map((todo) => `${todo.status}: ${todo.content}`)
        .join("\n"),
    },
    {
      id: "detailed-errors",
      label: "最近错误",
      value: lastError?.type ?? "无",
      description: lastError
        ? [lastError.description, ...errorSuggestions].join("\n")
        : "暂无错误",
    },
    {
      id: "system",
      label: "系统",
      value: [
        `${snapshot.environment.platform}/${snapshot.environment.arch}`,
        snapshot.environment.shell,
        snapshot.environment.pythonVersion,
        snapshot.workingDirectory,
      ].join(" · "),
      description: [
        `工作目录: ${snapshot.workingDirectory}`,
        `平台: ${snapshot.environment.platform}/${snapshot.environment.arch}`,
        `Shell: ${snapshot.environment.shell}`,
        `Python: ${snapshot.environment.pythonVersion}`,
      ].join("\n"),
    },
  ];

  return candidates.filter((item) => selected.has(item.id));
}

export function formatAgentStatusLocalTime(
  timestamp: number,
  timeZone?: string
): string {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    ...(timeZone ? { timeZone } : {}),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(timestamp)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function AgentStatusBar({
  timeZone = resolveAgentStatusLocalTimeZone(),
  now = Date.now,
}: AgentStatusBarProps = {}) {
  const snapshot = useThreadStore((state) => state.agentStatusSnapshot);
  const simulatedTimeOffsetMs = useThreadStore(
    (state) => state.thread.context?.agentStatus?.simulatedTimeOffsetMs ?? 0
  );
  const enabled = snapshot.components;
  const timestampsEnabled = enabled.includes("timestamps");
  const wallTime = _useAgentStatusWallTime(timestampsEnabled, now);
  const items = buildAgentStatusBarItems(
    timestampsEnabled
      ? {
          ...snapshot,
          now: observeAgentStatusNow(wallTime, simulatedTimeOffsetMs),
        }
      : snapshot,
    enabled,
    { timeZone }
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <footer
      className="bg-muted/20 flex h-7 shrink-0 items-center border-t px-2"
      aria-label="Agent 状态栏"
    >
      <div className="flex min-w-0 grow items-center gap-3 overflow-x-auto">
        {items.map((item) => {
          const status = (
            <span className="flex shrink-0 items-center gap-1 text-[0.6875rem]">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="max-w-64 truncate font-mono">{item.value}</span>
            </span>
          );
          return item.description ? (
            <Tooltip
              key={item.id}
              content={
                <span className="whitespace-pre-wrap">{item.description}</span>
              }
            >
              {status}
            </Tooltip>
          ) : (
            <span key={item.id}>{status}</span>
          );
        })}
      </div>
    </footer>
  );
}

export function resolveAgentStatusLocalTimeZone(): string | undefined {
  const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  return timeZone || undefined;
}

function _useAgentStatusWallTime(enabled: boolean, now: () => number): number {
  const [wallTime, setWallTime] = useState(now);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const timer = globalThis.setInterval(() => {
      setWallTime(now());
    }, 1_000);
    return () => globalThis.clearInterval(timer);
  }, [enabled, now]);

  return wallTime;
}
