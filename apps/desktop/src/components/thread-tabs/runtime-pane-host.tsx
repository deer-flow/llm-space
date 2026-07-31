"use client";

import { Fragment, type ReactNode } from "react";

import type { RuntimeId } from "@/shared/runtime";

interface RuntimePane {
  id: string;
  runtimeId: RuntimeId;
}

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
    <Fragment key={getPaneKey(tab)}>
      {renderPane(tab, tab.id === activeId)}
    </Fragment>
  ));
}
