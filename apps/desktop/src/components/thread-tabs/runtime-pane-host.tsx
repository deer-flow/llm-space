"use client";

import { memo, useEffect, useMemo, useState, type ReactNode } from "react";

import type { RuntimeId } from "@/shared/runtime";

import { retainRecentPaneKeys } from "./retain-recent-pane-keys";

const MAX_MOUNTED_PANE_VIEWS = 5;

interface RuntimePane {
  id: string;
  runtimeId: RuntimeId;
}

function _RuntimePane<T extends RuntimePane>({
  active,
  renderPane,
  tab,
  viewMounted,
}: {
  active: boolean;
  renderPane: (tab: T, active: boolean, viewMounted: boolean) => ReactNode;
  tab: T;
  viewMounted: boolean;
}) {
  return renderPane(tab, active, viewMounted);
}

const RuntimePane = memo(_RuntimePane) as typeof _RuntimePane;

export function RuntimePaneHost<T extends RuntimePane>({
  tabs,
  activeId,
  getPaneKey,
  maxMountedPanes = MAX_MOUNTED_PANE_VIEWS,
  renderPane,
}: {
  tabs: readonly T[];
  activeId: string | null;
  getPaneKey: (tab: T) => string;
  maxMountedPanes?: number;
  renderPane: (tab: T, active: boolean, viewMounted: boolean) => ReactNode;
}) {
  const [recentPaneKeys, setRecentPaneKeys] = useState<string[]>([]);
  const paneKeys = useMemo(() => tabs.map(getPaneKey), [getPaneKey, tabs]);
  const activeTab = tabs.find((tab) => tab.id === activeId);
  const activePaneKey = activeTab ? getPaneKey(activeTab) : null;
  const retainedPaneKeys = useMemo(
    () =>
      retainRecentPaneKeys(
        recentPaneKeys,
        paneKeys,
        activePaneKey,
        maxMountedPanes
      ),
    [activePaneKey, maxMountedPanes, paneKeys, recentPaneKeys]
  );
  const retainedPaneKeySet = useMemo(
    () => new Set(retainedPaneKeys),
    [retainedPaneKeys]
  );

  useEffect(() => {
    setRecentPaneKeys((current) =>
      current.length === retainedPaneKeys.length &&
      current.every((key, index) => key === retainedPaneKeys[index])
        ? current
        : retainedPaneKeys
    );
  }, [retainedPaneKeys]);

  return tabs.map((tab) => (
    <RuntimePane
      key={getPaneKey(tab)}
      active={tab.id === activeId}
      renderPane={renderPane}
      tab={tab}
      viewMounted={retainedPaneKeySet.has(getPaneKey(tab))}
    />
  ));
}
