import { describe, expect, test } from "bun:test";

import {
  reconcileRecentPaneKeys,
  retainRecentPaneKeys,
} from "./retain-recent-pane-keys";

describe("retainRecentPaneKeys", () => {
  test("keeps the active pane and four most recently used available panes", () => {
    expect(
      retainRecentPaneKeys(
        ["e", "d", "c", "b", "a"],
        ["a", "b", "c", "d", "e", "f", "g"],
        "g",
        5
      )
    ).toEqual(["g", "e", "d", "c", "b"]);
  });

  test("drops closed panes and deduplicates previously visited keys", () => {
    expect(
      retainRecentPaneKeys(
        ["closed", "b", "b"],
        ["a", "b", "c", "d"],
        "c",
        3
      )
    ).toEqual(["c", "b"]);
  });

  test("mounts only the active View until other tabs are visited", () => {
    expect(retainRecentPaneKeys([], ["a", "b", "c"], "b", 3)).toEqual([
      "b",
    ]);
    expect(retainRecentPaneKeys([], ["a", "b", "c"], null, 2)).toEqual([]);
    expect(retainRecentPaneKeys(["a"], ["a"], "a", 0)).toEqual([]);
  });

  test("reports an interleaved Thread or Trace pane before evicting it", () => {
    expect(
      reconcileRecentPaneKeys({
        previousKeys: ["trace-a", "thread-b", "thread-c"],
        availableKeys: ["trace-a", "thread-b", "thread-c", "trace-d"],
        activeKey: "trace-d",
        limit: 3,
      })
    ).toEqual({
      retained: ["trace-d", "trace-a", "thread-b"],
      evicted: ["thread-c"],
    });
  });

  test("does not report a closed pane as an LRU eviction", () => {
    expect(
      reconcileRecentPaneKeys({
        previousKeys: ["closed", "thread-a"],
        availableKeys: ["thread-a"],
        activeKey: "thread-a",
        limit: 3,
      })
    ).toEqual({ retained: ["thread-a"], evicted: [] });
  });
});
