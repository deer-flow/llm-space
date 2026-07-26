import type { RuntimeId } from "@/shared/runtime";

interface RuntimeScopedTab {
  id: string;
  runtimeId: RuntimeId;
}

/** Return only the tabs that belong to the currently visible workspace runtime. */
export function filterTabsForRuntime<T extends RuntimeScopedTab>(
  tabs: readonly T[],
  runtimeId: RuntimeId
): T[] {
  return tabs.filter((tab) => tab.runtimeId === runtimeId);
}

/**
 * Pick a safe active tab id for a runtime-scoped tab strip.
 *
 * If the globally active tab belongs to another runtime, the visible strip must
 * not follow it. Prefer the last visible tab because newly opened tabs append to
 * the end, matching the existing close/switch behavior.
 */
export function chooseActiveTabForRuntime<T extends RuntimeScopedTab>(
  tabs: readonly T[],
  activeId: string | null,
  runtimeId: RuntimeId
): string | null {
  const visible = filterTabsForRuntime(tabs, runtimeId);
  if (activeId !== null && visible.some((tab) => tab.id === activeId)) {
    return activeId;
  }
  return visible[visible.length - 1]?.id ?? null;
}

/** Remove every tab attached to a runtime, returning both survivors and removed tabs. */
export function removeTabsForRuntime<T extends RuntimeScopedTab>(
  tabs: readonly T[],
  runtimeId: RuntimeId
): { next: T[]; removed: T[] } {
  const next: T[] = [];
  const removed: T[] = [];
  for (const tab of tabs) {
    if (tab.runtimeId === runtimeId) removed.push(tab);
    else next.push(tab);
  }
  return { next, removed };
}
