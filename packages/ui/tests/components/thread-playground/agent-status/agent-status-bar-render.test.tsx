import { describe, expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { AgentStatusBar } from "../../../../src/components/thread-playground/agent-status/agent-status-bar";
import {
  createThreadStore,
  ThreadStoreContext,
} from "../../../../src/components/thread-playground/stores/thread-store";

function _renderBar(
  components: (
    "timestamps" | "tool-counter" | "todos" | "detailed-errors" | "system"
  )[],
  options: {
    timeZone?: string;
    now?: () => number;
  } = {}
): string {
  const store = createThreadStore(
    {
      context: {
        agentStatus: { components },
        messages: [],
      },
    },
    { wallClock: () => Date.UTC(2026, 7, 19, 6, 10, 20, 123) }
  );

  return renderToStaticMarkup(
    <ThreadStoreContext.Provider value={store}>
      <AgentStatusBar {...options} />
    </ThreadStoreContext.Provider>
  );
}

describe("Agent Status 展示栏", () => {
  test("没有配置任何组件时不占用底部空间", () => {
    expect(_renderBar([])).toBe("");
  });

  test("只展示已选择的组件且不再提供配置入口", () => {
    const markup = _renderBar(["timestamps"]);

    expect(markup).toContain("Agent 状态栏");
    expect(markup).toContain("时间");
    expect(markup).not.toContain("工具调用");
    expect(markup).not.toContain("选择 Agent 状态栏组件");
  });

  test("真实组件接线按中国本地时区展示时间", () => {
    const markup = _renderBar(["timestamps"], {
      timeZone: "Asia/Shanghai",
      now: () => Date.UTC(2026, 7, 19, 6, 10, 20, 123),
    });

    expect(markup).toContain("2026-08-19 14:10:20");
    expect(markup).not.toContain("2026-08-19T06:10:20.123Z");
  });
});
