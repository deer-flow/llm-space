import { describe, expect, test } from "bun:test";

import { reconcileThreadViewLru } from "./thread-view-lru";
import type { AppTab, ThreadTab, TraceTab } from "./use-thread-tabs";

function thread(name: string, path = `/${name}.json`): ThreadTab {
  return {
    id: `thread:${name}`,
    type: "thread",
    path,
    runtimeId: "local",
    paneId: `pane:${name}`,
  };
}

function trace(name: string): TraceTab {
  return {
    id: `trace:${name}`,
    type: "trace",
    projectId: "project",
    traceKey: name,
    title: name,
    runtimeId: "local",
  };
}

describe("thread view LRU", () => {
  const tabs: AppTab[] = [
    thread("a"),
    trace("one"),
    thread("b"),
    thread("c"),
    thread("d"),
  ];

  test("starts with only the active thread view", () => {
    expect(reconcileThreadViewLru([], tabs, "thread:a", 3)).toEqual({
      retained: ["pane:a"],
      evicted: [],
    });
  });

  test("promotes the active thread and evicts the least recent view", () => {
    expect(
      reconcileThreadViewLru(["pane:a"], tabs, "thread:b", 3).retained
    ).toEqual(["pane:b", "pane:a"]);

    expect(
      reconcileThreadViewLru(
        ["pane:c", "pane:b", "pane:a"],
        tabs,
        "thread:d",
        3
      )
    ).toEqual({
      retained: ["pane:d", "pane:c", "pane:b"],
      evicted: ["pane:a"],
    });
  });

  test("shrinking capacity retains the active and most recent views", () => {
    expect(
      reconcileThreadViewLru(
        ["pane:c", "pane:b", "pane:a"],
        tabs,
        "thread:b",
        2
      )
    ).toEqual({
      retained: ["pane:b", "pane:c"],
      evicted: ["pane:a"],
    });

    expect(
      reconcileThreadViewLru(
        ["pane:c", "pane:b", "pane:a"],
        tabs,
        "thread:a",
        1
      ).retained
    ).toEqual(["pane:a"]);
  });

  test("removes closed thread identities", () => {
    const withoutB = tabs.filter((tab) => tab.id !== "thread:b");
    expect(
      reconcileThreadViewLru(
        ["pane:c", "pane:b", "pane:a"],
        withoutB,
        "thread:c",
        3
      )
    ).toEqual({
      retained: ["pane:c", "pane:a"],
      evicted: ["pane:b"],
    });
  });

  test("uses pane identity across a path rename", () => {
    const a = thread("a");
    const renamed = { ...a, id: "thread:renamed", path: "/renamed.json" };
    expect(
      reconcileThreadViewLru([a.paneId], [renamed], renamed.id, 3)
    ).toEqual({ retained: [a.paneId], evicted: [] });
  });

  test("trace activation neither consumes capacity nor changes recency", () => {
    expect(
      reconcileThreadViewLru(
        ["pane:c", "pane:b", "pane:a"],
        tabs,
        "trace:one",
        3
      )
    ).toEqual({
      retained: ["pane:c", "pane:b", "pane:a"],
      evicted: [],
    });
  });
});
