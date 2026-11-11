"use client";

import { memo, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

import type { RuntimeId } from "@/shared/runtime";

import {
  reconcileRecentPaneKeys,
  retainRecentPaneKeys,
} from "./retain-recent-pane-keys";
import { DEFAULT_VIEW_CACHE_SIZE } from "./view-cache-size";

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
  maxMountedPanes = DEFAULT_VIEW_CACHE_SIZE,
  onBeforeViewUnmount,
  renderPane,
}: {
  tabs: readonly T[];
  activeId: string | null;
  getPaneKey: (tab: T) => string;
  maxMountedPanes?: number;
  onBeforeViewUnmount?: (paneKey: string) => void;
  renderPane: (tab: T, active: boolean, viewMounted: boolean) => ReactNode;
}) {
  const paneKeys = useMemo(() => tabs.map(getPaneKey), [getPaneKey, tabs]);
  const activeTab = tabs.find((tab) => tab.id === activeId);
  const activePaneKey = activeTab ? getPaneKey(activeTab) : null;
  const [retainedPaneKeys, setRetainedPaneKeys] = useState(() =>
    retainRecentPaneKeys([], paneKeys, activePaneKey, maxMountedPanes)
  );
  const retainedPaneKeySet = useMemo(
    () => new Set(retainedPaneKeys),
    [retainedPaneKeys]
  );

  useLayoutEffect(() => {
    const transition = reconcileRecentPaneKeys({
      previousKeys: retainedPaneKeys,
      availableKeys: paneKeys,
      activeKey: activePaneKey,
      limit: maxMountedPanes,
    });
    if (
      transition.retained.length === retainedPaneKeys.length &&
      transition.retained.every(
        (key, index) => key === retainedPaneKeys[index]
      )
    ) {
      return;
    }
    for (const paneKey of transition.evicted) {
      onBeforeViewUnmount?.(paneKey);
    }
    setRetainedPaneKeys(transition.retained);
  }, [
    activePaneKey,
    maxMountedPanes,
    onBeforeViewUnmount,
    paneKeys,
    retainedPaneKeys,
  ]);

  return tabs.map((tab) => (
    <RuntimePane
      key={getPaneKey(tab)}
      active={tab.id === activeId}
      renderPane={renderPane}
      tab={tab}
      viewMounted={
        getPaneKey(tab) === activePaneKey ||
        retainedPaneKeySet.has(getPaneKey(tab))
      }
    />
  ));
}
