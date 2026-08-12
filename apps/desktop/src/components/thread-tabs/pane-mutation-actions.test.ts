import { describe, expect, test } from "bun:test";

import { acquireFileMutationForTabs } from "./pane-file-mutation";
import {
  closeAllTabsIfAllowed,
  closeOtherTabsIfAllowed,
  closeTabIfAllowed,
  refreshTabIfAllowed,
} from "./pane-mutation-actions";
import { RuntimeRunTracker } from "./runtime-run-tracker";
import type { AppTab } from "./use-thread-tabs";

const TABS: AppTab[] = [
  {
    id: "thread:local:folder/a.json",
    paneId: "pane-a",
    path: "folder/a.json",
    runtimeId: "local",
    type: "thread",
  },
  {
    id: "thread:local:folder/b.json",
    paneId: "pane-b",
    path: "folder/b.json",
    runtimeId: "local",
    type: "thread",
  },
];

describe("pane mutation production actions", () => {
  test("close, close others, close all, and refresh stop before their mutations", () => {
    const tracker = new RuntimeRunTracker();
    tracker.beginRun("pane-a", "local", "run-a");
    tracker.beginRun("pane-b", "local", "run-b");
    let mutations = 0;
    let blocked = 0;
    const onBlocked = () => {
      blocked += 1;
    };

    expect(
      closeTabIfAllowed({
        tracker,
        tabs: TABS,
        targetId: TABS[0].id,
        onBlocked,
        commitViews: () => undefined,
        close: () => {
          mutations += 1;
        },
      })
    ).toBe(false);
    expect(
      closeOtherTabsIfAllowed({
        tracker,
        tabs: TABS,
        keepId: TABS[0].id,
        runtimeId: "local",
        onBlocked,
        commitViews: () => undefined,
        closeOthers: () => {
          mutations += 1;
        },
      })
    ).toBe(false);
    expect(
      closeAllTabsIfAllowed({
        tracker,
        tabs: TABS,
        runtimeId: "local",
        onBlocked,
        commitViews: () => undefined,
        closeAll: () => {
          mutations += 1;
        },
      })
    ).toBe(false);
    expect(
      refreshTabIfAllowed({
        tracker,
        tabs: TABS,
        targetId: TABS[0].id,
        onBlocked,
        refresh: () => {
          mutations += 1;
        },
      })
    ).toBeNull();
    expect({ blocked, mutations }).toEqual({ blocked: 4, mutations: 0 });
  });

  test("commits the exact closing views before removing their tabs", () => {
    const tracker = new RuntimeRunTracker();
    const events: string[] = [];
    const commitViews = (tabs: AppTab[]) => {
      events.push(`commit:${tabs.map((tab) => tab.id).join(",")}`);
    };

    expect(
      closeTabIfAllowed({
        tracker,
        tabs: TABS,
        targetId: TABS[0].id,
        onBlocked: () => undefined,
        commitViews,
        close: (id) => events.push(`close:${id}`),
      })
    ).toBe(true);
    expect(events).toEqual([
      `commit:${TABS[0].id}`,
      `close:${TABS[0].id}`,
    ]);

    events.length = 0;
    expect(
      closeOtherTabsIfAllowed({
        tracker,
        tabs: TABS,
        keepId: TABS[0].id,
        runtimeId: "local",
        onBlocked: () => undefined,
        commitViews,
        closeOthers: (id) => events.push(`closeOthers:${id}`),
      })
    ).toBe(true);
    expect(events).toEqual([
      `commit:${TABS[1].id}`,
      `closeOthers:${TABS[0].id}`,
    ]);

    events.length = 0;
    expect(
      closeAllTabsIfAllowed({
        tracker,
        tabs: TABS,
        runtimeId: "local",
        onBlocked: () => undefined,
        commitViews,
        closeAll: (runtimeId) => events.push(`closeAll:${runtimeId}`),
      })
    ).toBe(true);
    expect(events).toEqual([
      `commit:${TABS.map((tab) => tab.id).join(",")}`,
      "closeAll:local",
    ]);
  });

  test("delete and overwrite path guards include open descendants", () => {
    const tracker = new RuntimeRunTracker();
    tracker.beginRun("pane-a", "local", "run-a");
    let blocked = 0;

    const deleteRelease = acquireFileMutationForTabs({
      tracker,
      tabs: TABS,
      paths: ["folder"],
      runtimeId: "local",
      onBlocked: () => {
        blocked += 1;
      },
    });
    const overwriteRelease = acquireFileMutationForTabs({
      tracker,
      tabs: TABS,
      paths: ["elsewhere/source.json", "folder/a.json"],
      runtimeId: "local",
      onBlocked: () => {
        blocked += 1;
      },
    });

    expect(deleteRelease).toBeNull();
    expect(overwriteRelease).toBeNull();
    expect(blocked).toBe(2);
  });

  test("refresh keeps its pane reserved until the remount acknowledges it", () => {
    const tracker = new RuntimeRunTracker();
    let refreshCalls = 0;

    const reservation = refreshTabIfAllowed({
      tracker,
      tabs: TABS,
      targetId: TABS[0].id,
      onBlocked: () => undefined,
      refresh: () => {
        refreshCalls += 1;
      },
    });

    expect(refreshCalls).toBe(1);
    expect(tracker.beginRun("pane-a", "local", "during-refresh")).toBe(
      false
    );
    expect(typeof reservation).toBe("object");
    if (!reservation || typeof reservation !== "object") return;
    reservation.release();
    expect(tracker.beginRun("pane-a", "local", "after-remount")).toBe(true);
  });

  test("file mutation reserves the runtime against newly opened panes", () => {
    const tracker = new RuntimeRunTracker();
    const release = acquireFileMutationForTabs({
      tracker,
      tabs: [],
      paths: ["folder/a.json"],
      runtimeId: "local",
      onBlocked: () => undefined,
    });

    expect(release).not.toBeNull();
    expect(
      tracker.beginRun(
        "new-pane",
        "local",
        "during-move",
        "folder/a.json"
      )
    ).toBe(false);
    expect(
      acquireFileMutationForTabs({
        tracker,
        tabs: [],
        paths: ["folder/a.json"],
        runtimeId: "local",
        onBlocked: () => undefined,
      })
    ).toBeNull();
    release?.();
    expect(
      tracker.beginRun(
        "new-pane",
        "local",
        "after-move",
        "folder/a.json"
      )
    ).toBe(true);
  });
});
