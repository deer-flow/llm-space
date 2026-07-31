import { expect, test } from "bun:test";

import { pruneInvalidRestoredTabs } from "./restored-tab-pruning";
import type { AppTab } from "./use-thread-tabs";

test("restoration pruning preserves busy and subsequently opened pane owners", () => {
  const busy: AppTab = {
    id: "thread:local:busy.json",
    paneId: "busy-pane",
    path: "busy.json",
    runtimeId: "local",
    type: "thread",
  };
  const idle: AppTab = {
    id: "thread:local:idle.json",
    paneId: "idle-pane",
    path: "idle.json",
    runtimeId: "local",
    type: "thread",
  };
  const added: AppTab = {
    id: "thread:local:added.json",
    paneId: "added-pane",
    path: "added.json",
    runtimeId: "local",
    type: "thread",
  };

  expect(
    pruneInvalidRestoredTabs(
      [busy, idle, added],
      [busy, idle],
      (tab) => tab.type !== "thread" || tab.paneId !== "busy-pane"
    )
  ).toEqual([busy, added]);

  const reopened = { ...idle, paneId: "reopened-pane" };
  expect(
    pruneInvalidRestoredTabs([reopened], [idle], () => true)
  ).toEqual([reopened]);
});
