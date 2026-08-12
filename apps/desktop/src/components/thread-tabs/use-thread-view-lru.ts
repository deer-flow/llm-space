"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { reconcileThreadViewLru } from "./thread-view-lru";
import type { AppTab } from "./use-thread-tabs";

function _samePaneIds(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((paneId, index) => paneId === right[index])
  );
}

export function useThreadViewLru({
  tabs,
  activeId,
  capacity,
  commitPane,
}: {
  tabs: readonly AppTab[];
  activeId: string | null;
  capacity: number;
  commitPane: (paneId: string) => void;
}): ReadonlySet<string> {
  const [retained, setRetained] = useState(() =>
    reconcileThreadViewLru([], tabs, activeId, capacity).retained
  );
  const retainedRef = useRef(retained);

  useLayoutEffect(() => {
    const transition = reconcileThreadViewLru(
      retainedRef.current,
      tabs,
      activeId,
      capacity
    );
    if (_samePaneIds(retainedRef.current, transition.retained)) {
      return;
    }
    for (const paneId of transition.evicted) {
      commitPane(paneId);
    }
    retainedRef.current = transition.retained;
    setRetained(transition.retained);
  }, [activeId, capacity, commitPane, tabs]);

  return useMemo(() => new Set(retained), [retained]);
}
