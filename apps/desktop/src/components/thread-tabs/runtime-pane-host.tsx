"use client";

import { memo, type ReactNode } from "react";

import type { RuntimeId } from "@/shared/runtime";

interface RuntimePane {
  id: string;
  runtimeId: RuntimeId;
}

function _RuntimePane<T extends RuntimePane>({
  active,
  renderPane,
  tab,
}: {
  active: boolean;
  renderPane: (tab: T, active: boolean) => ReactNode;
  tab: T;
}) {
  return renderPane(tab, active);
}

const RuntimePane = memo(_RuntimePane) as typeof _RuntimePane;

export function RuntimePaneHost<T extends RuntimePane>({
  tabs,
  activeId,
  getPaneKey,
  renderPane,
}: {
  tabs: readonly T[];
  activeId: string | null;
  getPaneKey: (tab: T) => string;
  renderPane: (tab: T, active: boolean) => ReactNode;
}) {
  return tabs.map((tab) => (
    <RuntimePane
      key={getPaneKey(tab)}
      active={tab.id === activeId}
      renderPane={renderPane}
      tab={tab}
    />
  ));
}
