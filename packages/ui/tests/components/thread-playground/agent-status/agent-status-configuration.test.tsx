import { describe, expect, test } from "bun:test";

import type { Thread } from "@llm-space/core";
import { renderToStaticMarkup } from "react-dom/server";

import { AgentStatusListView } from "../../../../src/components/thread-playground/agent-status/agent-status-list-view";
import {
  AGENT_STATUS_COMPONENT_OPTIONS,
  AGENT_STATUS_TIME_PRESETS,
  selectAgentStatusComponents,
} from "../../../../src/components/thread-playground/agent-status/agent-status-options";
import {
  createThreadStore,
  ThreadStoreContext,
} from "../../../../src/components/thread-playground/stores/thread-store";
import { HostServicesProvider, type HostServices } from "../../../../src/host";
import { TooltipProvider } from "../../../../src/ui/tooltip";

const COMPONENT_IDS = [
  "timestamps",
  "tool-counter",
  "todos",
  "detailed-errors",
  "system",
] as const;

function _renderList(
  thread: Thread,
  options: { readonly?: boolean; presentational?: boolean } = {}
): string {
  const store = createThreadStore(thread);
  const host = {
    presentational: options.presentational ?? false,
  } as HostServices;

  return renderToStaticMarkup(
    <HostServicesProvider value={host}>
      <TooltipProvider>
        <ThreadStoreContext.Provider value={store}>
          <AgentStatusListView readonly={options.readonly} />
        </ThreadStoreContext.Provider>
      </TooltipProvider>
    </HostServicesProvider>
  );
}

describe("Agent Status 选择配置", () => {
  test("未配置时复用稳定空列表，避免外部 Store 无限更新", () => {
    const store = createThreadStore({});
    const first = selectAgentStatusComponents(store.getState());
    const second = selectAgentStatusComponents(store.getState());

    expect(first).toBe(second);
    expect(first).toEqual([]);
  });

  test("提供五个可选组件和时间模拟配置", () => {
    expect(AGENT_STATUS_COMPONENT_OPTIONS.map((option) => option.id)).toEqual([
      ...COMPONENT_IDS,
    ]);
    expect(
      AGENT_STATUS_COMPONENT_OPTIONS.every(
        (option) => option.label && option.description
      )
    ).toBe(true);
    expect(AGENT_STATUS_TIME_PRESETS).toEqual([
      { label: "实时", offsetMs: 0 },
      { label: "昨天", offsetMs: -86_400_000 },
      { label: "明天", offsetMs: 86_400_000 },
    ]);
  });

  test("像 Tools 一样展示已选项和 Add 入口", () => {
    const emptyMarkup = _renderList({});
    expect(emptyMarkup).toContain("Add");
    expect(emptyMarkup).not.toContain("移除时间戳跟踪");

    const selectedMarkup = _renderList({
      context: {
        agentStatus: { components: ["timestamps", "system"] },
      },
    });
    expect(selectedMarkup).toContain("时间戳跟踪");
    expect(selectedMarkup).toContain("系统状态感知");
    expect(selectedMarkup).toContain("移除时间戳跟踪");
  });

  test("展示模式隐藏 Add，运行或只读状态禁止移除", () => {
    const thread: Thread = {
      context: {
        agentStatus: { components: ["timestamps"] },
      },
    };
    expect(_renderList(thread, { presentational: true })).not.toContain("Add");

    const readonlyMarkup = _renderList(thread, { readonly: true });
    expect(readonlyMarkup).toContain("disabled");
    expect(readonlyMarkup).toContain("移除时间戳跟踪");
  });
});
