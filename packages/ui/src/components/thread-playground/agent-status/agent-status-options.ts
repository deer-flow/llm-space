import type { AgentStatusComponent, Thread } from "@llm-space/core";
import {
  Clock3Icon,
  ListChecksIcon,
  MonitorCogIcon,
  OctagonAlertIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";

export interface AgentStatusComponentOption {
  id: AgentStatusComponent;
  label: string;
  description: string;
  icon: LucideIcon;
}

const EMPTY_AGENT_STATUS_COMPONENTS: readonly AgentStatusComponent[] =
  Object.freeze([]);

/**
 * 为 Zustand 提供引用稳定的组件快照；未配置线程不能在 selector 内创建新数组。
 */
export function selectAgentStatusComponents(state: {
  thread: Thread;
}): readonly AgentStatusComponent[] {
  return (
    state.thread.context?.agentStatus?.components ??
    EMPTY_AGENT_STATUS_COMPONENTS
  );
}

export const AGENT_STATUS_COMPONENT_OPTIONS = [
  {
    id: "timestamps",
    label: "时间戳跟踪",
    description: "为用户消息和工具响应记录稳定时间，帮助 Agent 理解时序关系。",
    icon: Clock3Icon,
  },
  {
    id: "tool-counter",
    label: "工具调用计数",
    description: "按工具记录全局调用序号，让 Agent 感知重复尝试与操作成本。",
    icon: WrenchIcon,
  },
  {
    id: "todos",
    label: "TODO 列表",
    description:
      "提供可持久化的任务清单与状态更新工具，作为 Agent 的外部记忆。",
    icon: ListChecksIcon,
  },
  {
    id: "detailed-errors",
    label: "详细错误信息",
    description: "附加错误类型、调用参数、堆栈和针对性的修复建议。",
    icon: OctagonAlertIcon,
  },
  {
    id: "system",
    label: "系统状态感知",
    description:
      "向 Agent 提供当前时间、工作目录、平台、Shell 和 Python 版本。",
    icon: MonitorCogIcon,
  },
] as const satisfies readonly AgentStatusComponentOption[];

export const AGENT_STATUS_TIME_PRESETS = [
  { label: "实时", offsetMs: 0 },
  { label: "昨天", offsetMs: -86_400_000 },
  { label: "明天", offsetMs: 86_400_000 },
] as const;

export function getAgentStatusComponentOption(
  component: AgentStatusComponent
): AgentStatusComponentOption {
  const option = AGENT_STATUS_COMPONENT_OPTIONS.find(
    (candidate) => candidate.id === component
  );
  if (!option) {
    throw new Error("未知的 Agent Status 组件：" + component);
  }
  return option;
}
