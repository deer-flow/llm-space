import { describe, expect, test } from "bun:test";

import { retainRecentPaneKeys } from "./retain-recent-pane-keys";

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

  test("drops closed panes, deduplicates keys, and fills from newest tabs", () => {
    expect(
      retainRecentPaneKeys(
        ["closed", "b", "b"],
        ["a", "b", "c", "d"],
        "c",
        3
      )
    ).toEqual(["c", "b", "d"]);
  });

  test("handles no active pane and a disabled mount budget", () => {
    expect(retainRecentPaneKeys([], ["a", "b", "c"], null, 2)).toEqual([
      "c",
      "b",
    ]);
    expect(retainRecentPaneKeys(["a"], ["a"], "a", 0)).toEqual([]);
  });
});
