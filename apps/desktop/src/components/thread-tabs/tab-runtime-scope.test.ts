import { describe, expect, test } from "bun:test";

import type { RuntimeId } from "@/shared/runtime";

import {
  chooseActiveTabForRuntime,
  filterTabsForRuntime,
  removeTabsForRuntime,
  resolveShareThreadTarget,
} from "./tab-runtime-scope";

interface TestTab {
  id: string;
  runtimeId: RuntimeId;
}

const tabs: TestTab[] = [
  { id: "thread:local:same.json", runtimeId: "local" },
  { id: "thread:remote:server-1:same.json", runtimeId: "remote:server-1" },
  { id: "thread:remote:server-1:other.json", runtimeId: "remote:server-1" },
  { id: "thread:remote:server-2:same.json", runtimeId: "remote:server-2" },
];

describe("tab runtime scope", () => {
  test("keeps local and remote tabs with the same path isolated", () => {
    expect(filterTabsForRuntime(tabs, "local").map((tab) => tab.id)).toEqual([
      "thread:local:same.json",
    ]);
    expect(
      filterTabsForRuntime(tabs, "remote:server-1").map((tab) => tab.id)
    ).toEqual([
      "thread:remote:server-1:same.json",
      "thread:remote:server-1:other.json",
    ]);
  });

  test("uses the current active tab when it belongs to the visible runtime", () => {
    expect(
      chooseActiveTabForRuntime(
        tabs,
        "thread:remote:server-1:same.json",
        "remote:server-1"
      )
    ).toBe("thread:remote:server-1:same.json");
  });

  test("falls back to the newest visible tab when active belongs to another runtime", () => {
    expect(
      chooseActiveTabForRuntime(
        tabs,
        "thread:local:same.json",
        "remote:server-1"
      )
    ).toBe("thread:remote:server-1:other.json");
  });

  test("returns null when a workspace has no visible tabs", () => {
    expect(
      chooseActiveTabForRuntime(
        tabs,
        "thread:local:same.json",
        "remote:missing"
      )
    ).toBeNull();
  });

  test("removes only tabs attached to the disconnected runtime", () => {
    const { next, removed } = removeTabsForRuntime(tabs, "remote:server-1");

    expect(removed.map((tab) => tab.id)).toEqual([
      "thread:remote:server-1:same.json",
      "thread:remote:server-1:other.json",
    ]);
    expect(next.map((tab) => tab.id)).toEqual([
      "thread:local:same.json",
      "thread:remote:server-2:same.json",
    ]);
  });
});

describe("share target runtime scope", () => {
  test("retains an explicit remote owner even while local is visible", () => {
    expect(
      resolveShareThreadTarget(
        { path: "threads/same.json", runtimeId: "remote:server-1" },
        "local",
        { path: "threads/local.json", runtimeId: "local" }
      )
    ).toEqual({
      path: "threads/same.json",
      runtimeId: "remote:server-1",
    });
  });

  test("resolves the active remote tab for menu and palette entry points", () => {
    expect(
      resolveShareThreadTarget({}, "remote:server-1", {
        path: "threads/active.json",
        runtimeId: "remote:server-1",
      })
    ).toEqual({
      path: "threads/active.json",
      runtimeId: "remote:server-1",
    });
  });

  test("preserves local active-thread sharing", () => {
    expect(
      resolveShareThreadTarget({}, "local", {
        path: "threads/local.json",
        runtimeId: "local",
      })
    ).toEqual({ path: "threads/local.json", runtimeId: "local" });
  });

  test("does not substitute an active tab owned by another runtime", () => {
    expect(
      resolveShareThreadTarget({ runtimeId: "remote:server-1" }, "local", {
        path: "threads/local.json",
        runtimeId: "local",
      })
    ).toBeNull();
  });
});
