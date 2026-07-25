"use client";

import { uuid } from "@llm-space/core";
import {
  LOCAL_STORAGE_KEYS,
  readLocalStorage,
  removeLocalStorage,
  writeLocalStorage,
} from "@llm-space/ui/lib/local-storage";
import { threadTitleFromPath } from "@llm-space/ui/lib/thread-file";
import { useCallback, useEffect, useRef, useState } from "react";

import { createFileSystemClient, traceClient } from "@/client";
import { listRuntimes } from "@/client/remote-servers";
import type { RuntimeId } from "@/shared/runtime";

import { removeTabsForRuntime } from "./tab-runtime-scope";

/** An open workspace thread tab. `id` is stable as `thread:{path}`. */
export interface ThreadTab {
  id: string;
  type: "thread";
  path: string;
  runtimeId: RuntimeId;
  /** Stable editor identity that survives path rewrites. */
  paneId: string;
  /** Bumped by `refresh(id)` to force the pane to reload from disk. */
  refreshNonce?: number;
}

/** An open imported trace workbench tab. `id` is `trace:{runtimeId}:{projectId}:{traceKey}`. */
export interface TraceTab {
  id: string;
  type: "trace";
  projectId: string;
  traceKey: string;
  title: string;
  runtimeId: RuntimeId;
  refreshNonce?: number;
}

/** Any tab shown in the main chrome tab bar. */
export type AppTab = ThreadTab | TraceTab;

type PersistedTab =
  | { type: "thread"; path: string; runtimeId?: RuntimeId }
  | {
      type: "trace";
      projectId: string;
      traceKey: string;
      title?: string;
      runtimeId?: RuntimeId;
    };

/** Derive a tab label from an app tab. */
export function tabLabel(tab: AppTab): string {
  return tab.type === "thread" ? threadTitleFromPath(tab.path) : tab.title;
}

export interface ThreadTabs {
  /** Open tabs in their visual order. */
  tabs: AppTab[];
  /** Currently focused tab id, or `null` when no tabs are open. */
  activeId: string | null;
  /**
   * Open a workspace thread path, adding it if absent and focusing it. Callers
   * already know the file exists; a stale path reports as a pane read error.
   */
  open: (path: string, runtimeId?: RuntimeId) => void;
  /**
   * Open an imported trace workbench, adding it if absent and focusing it. The
   * trace must already be listed by the Trace Panel or restorable from storage.
   */
  openTrace: (input: {
    projectId: string;
    traceKey: string;
    title: string;
    runtimeId?: RuntimeId;
  }) => void;
  /** Close a tab by app-tab id; if it was active, focus its nearest neighbor. */
  close: (id: string) => void;
  /** Close every open tab except `keep`, which becomes active. */
  closeOthers: (keep: string) => void;
  /** Close every open tab in the same runtime except `keep`, which becomes active. */
  closeOthersInRuntime: (keep: string, runtimeId: RuntimeId) => void;
  /** Close every open tab and push the group onto the reopen stack. */
  closeAll: () => void;
  /** Close every open tab in one runtime and push the group onto the reopen stack. */
  closeAllInRuntime: (runtimeId: RuntimeId) => void;
  /** Close every open thread tab attached to a runtime. */
  closeRuntime: (runtimeId: RuntimeId) => void;
  /** Drop every open tab attached to a runtime without adding it to reopen history. */
  discardRuntime: (runtimeId: RuntimeId) => void;
  /** Move the tab at `from` to `to` within the visual tab order. */
  reorder: (from: number, to: number) => void;
  /** Move tabs by indexes within one runtime's visible tab order. */
  reorderInRuntime: (from: number, to: number, runtimeId: RuntimeId) => void;
  /** Focus an already-open tab by id. */
  activate: (id: string) => void;
  /** Focus the tab after the active one in visual order, wrapping around. */
  activateNext: () => void;
  /** Focus the tab before the active one in visual order, wrapping around. */
  activatePrevious: () => void;
  /** Reload the tab's backing file/workbench, discarding unsaved local edits. */
  refresh: (id: string) => void;
  /** File-tree delete: close open thread tabs at or beneath `removed`. */
  handleRemove: (removed: string, runtimeId?: RuntimeId) => void;
  /** File-tree rename/move: rewrite open thread tab paths under `from` to `to`. */
  handleMove: (from: string, to: string, runtimeId?: RuntimeId) => void;
  /** Consume the marker that prevents an overwritten editor from writing back. */
  consumeDiscardedPane: (paneId: string) => boolean;
  /** Trace metadata edit: update labels for already-open trace tabs. */
  handleTraceTitleChange: (
    projectId: string,
    traceKey: string,
    title: string,
    runtimeId?: RuntimeId
  ) => void;
  /**
   * Reopen the most recently closed tab group, silently skipping files or traces
   * that no longer exist.
   */
  reopenClosed: () => void;
}

function _threadTabId(path: string, runtimeId: RuntimeId = "local"): string {
  return `thread:${runtimeId}:${path}`;
}

function _traceTabId(
  projectId: string,
  traceKey: string,
  runtimeId: RuntimeId = "local"
): string {
  return `trace:${runtimeId}:${projectId}:${traceKey}`;
}

function _createThreadTab(
  path: string,
  runtimeId: RuntimeId = "local"
): ThreadTab {
  return {
    id: _threadTabId(path, runtimeId),
    type: "thread",
    path,
    runtimeId,
    paneId: `thread-pane:${uuid()}`,
  };
}

function _createTraceTab({
  projectId,
  traceKey,
  title,
  runtimeId = "local",
}: {
  projectId: string;
  traceKey: string;
  title: string;
  runtimeId?: RuntimeId;
}): TraceTab {
  return {
    id: _traceTabId(projectId, traceKey, runtimeId),
    type: "trace",
    projectId,
    traceKey,
    title,
    runtimeId,
  };
}

function _persistable(tab: AppTab): PersistedTab {
  return tab.type === "thread"
    ? { type: "thread", path: tab.path, runtimeId: tab.runtimeId }
    : {
        type: "trace",
        projectId: tab.projectId,
        traceKey: tab.traceKey,
        title: tab.title,
        runtimeId: tab.runtimeId,
      };
}

function _fromPersisted(tab: PersistedTab): AppTab | null {
  if (tab.type === "thread" && tab.path) {
    return _createThreadTab(tab.path, tab.runtimeId ?? "local");
  }
  if (tab.type === "trace" && tab.projectId && tab.traceKey) {
    return _createTraceTab({
      projectId: tab.projectId,
      traceKey: tab.traceKey,
      title: tab.title || tab.traceKey,
      runtimeId: tab.runtimeId ?? "local",
    });
  }
  return null;
}

function _dedupeTabs(tabs: AppTab[]): AppTab[] {
  const seen = new Set<string>();
  return tabs.filter((tab) => {
    if (seen.has(tab.id)) return false;
    seen.add(tab.id);
    return true;
  });
}

function _loadPersistedTabs(): AppTab[] {
  try {
    const raw = readLocalStorage(LOCAL_STORAGE_KEYS.openAppTabs);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return _dedupeTabs(
        parsed
          .map((item): PersistedTab | null => {
            if (!item || typeof item !== "object") return null;
            const t = item as PersistedTab;
            return t.type === "thread" || t.type === "trace" ? t : null;
          })
          .map((item) => (item ? _fromPersisted(item) : null))
          .filter((tab): tab is AppTab => tab !== null)
      );
    }

    const legacyRaw = readLocalStorage(LOCAL_STORAGE_KEYS.legacyOpenTabs);
    if (legacyRaw === null) return [];
    const legacy: unknown = JSON.parse(legacyRaw);
    return Array.isArray(legacy)
      ? _dedupeTabs(
          legacy
            .filter((path): path is string => typeof path === "string")
            .map((path) => _createThreadTab(path, "local"))
        )
      : [];
  } catch {
    return [];
  }
}

function _savePersistedTabs(tabs: AppTab[]): void {
  writeLocalStorage(
    LOCAL_STORAGE_KEYS.openAppTabs,
    JSON.stringify(tabs.map(_persistable))
  );
}

function _activeAfterRemovingTabs(
  current: string | null,
  next: AppTab[],
  removed: AppTab[]
): string | null {
  return current !== null && removed.some((tab) => tab.id === current)
    ? (next[next.length - 1]?.id ?? null)
    : current;
}

function _loadPersistedActive(tabs: AppTab[]): string | null {
  try {
    const active = readLocalStorage(LOCAL_STORAGE_KEYS.activeTab);
    if (!active) return tabs[0]?.id ?? null;
    if (tabs.some((tab) => tab.id === active)) return active;
    const legacyThreadId = _threadTabId(active, "local");
    return tabs.some((tab) => tab.id === legacyThreadId)
      ? legacyThreadId
      : (tabs[0]?.id ?? null);
  } catch {
    return tabs[0]?.id ?? null;
  }
}

function _savePersistedActive(id: string | null): void {
  if (id === null) {
    removeLocalStorage(LOCAL_STORAGE_KEYS.activeTab);
  } else {
    writeLocalStorage(LOCAL_STORAGE_KEYS.activeTab, id);
  }
}

function _isUnder(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`);
}

async function _threadFileExists(
  path: string,
  runtimeId: RuntimeId
): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  const parent = slash === -1 ? "" : path.slice(0, slash);
  try {
    const siblings = await createFileSystemClient(runtimeId).ls(parent);
    return siblings.some((n) => n.path === path && n.type === "file");
  } catch {
    return false;
  }
}

async function _traceExists(tab: TraceTab): Promise<boolean> {
  try {
    await traceClient.readTrace(tab.projectId, tab.traceKey, tab.runtimeId);
    return true;
  } catch {
    return false;
  }
}

async function _tabExists(
  tab: AppTab,
  availableRuntimeIds?: Set<RuntimeId>
): Promise<boolean> {
  if (availableRuntimeIds && !availableRuntimeIds.has(tab.runtimeId)) {
    return false;
  }
  return tab.type === "thread"
    ? _threadFileExists(tab.path, tab.runtimeId)
    : _traceExists(tab);
}

async function _availableRuntimeIds(): Promise<Set<RuntimeId> | undefined> {
  try {
    return new Set((await listRuntimes()).map((runtime) => runtime.id));
  } catch {
    return undefined;
  }
}

export function useThreadTabs(): ThreadTabs {
  const restoredTabs = useRef<AppTab[] | null>(null);
  if (restoredTabs.current === null) {
    restoredTabs.current = _loadPersistedTabs();
  }
  const [tabs, setTabs] = useState<AppTab[]>(restoredTabs.current);
  const [activeId, setActiveId] = useState<string | null>(() =>
    _loadPersistedActive(restoredTabs.current ?? [])
  );

  const tabsRef = useRef(tabs);
  // Keep tabsRef pointing at the latest committed tabs. Syncing in a passive
  // effect instead of the render body avoids leaking work from renders React
  // discards or replays; every read of tabsRef happens post-commit (effects and
  // event handlers), so the seeded ref stays consistent.
  useEffect(() => {
    tabsRef.current = tabs;
  });
  const closedStack = useRef<PersistedTab[][]>([]);
  const discardedPaneIds = useRef(new Set<string>());
  const pushClosed = useCallback((closed: AppTab[]) => {
    if (closed.length > 0) {
      closedStack.current.push(closed.map(_persistable));
    }
  }, []);

  useEffect(() => {
    _savePersistedTabs(tabs);
  }, [tabs]);

  useEffect(() => {
    _savePersistedActive(activeId);
  }, [activeId]);

  useEffect(() => {
    const restored = tabsRef.current;
    const restoredActive = activeId;
    if (restored.length === 0) return;
    let cancelled = false;
    void (async () => {
      const runtimeIds = await _availableRuntimeIds();
      return Promise.all(
        restored.map(async (tab) =>
          (await _tabExists(tab, runtimeIds)) ? tab : null
        )
      );
    })().then((checked) => {
      if (cancelled) return;
      const alive = checked.filter((tab): tab is AppTab => tab !== null);
      if (alive.length !== restored.length) setTabs(alive);
      const aliveIds = alive.map((tab) => tab.id);
      setActiveId(
        restoredActive !== null && aliveIds.includes(restoredActive)
          ? restoredActive
          : (alive[0]?.id ?? null)
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only restoration check; reads the initial activeId, must not re-run when it changes
  }, []);

  const open = useCallback((path: string, runtimeId: RuntimeId = "local") => {
    const id = _threadTabId(path, runtimeId);
    if (tabsRef.current.some((tab) => tab.id === id)) {
      setActiveId(id);
      return;
    }
    setTabs((prev) =>
      prev.some((tab) => tab.id === id)
        ? prev
        : [...prev, _createThreadTab(path, runtimeId)]
    );
    setActiveId(id);
  }, []);

  const openTrace = useCallback(
    ({
      projectId,
      traceKey,
      title,
      runtimeId = "local",
    }: {
      projectId: string;
      traceKey: string;
      title: string;
      runtimeId?: RuntimeId;
    }) => {
      const id = _traceTabId(projectId, traceKey, runtimeId);
      if (tabsRef.current.some((tab) => tab.id === id)) {
        setActiveId(id);
        return;
      }
      setTabs((prev) =>
        prev.some((tab) => tab.id === id)
          ? prev
          : [
              ...prev,
              _createTraceTab({ projectId, traceKey, title, runtimeId }),
            ]
      );
      setActiveId(id);
    },
    []
  );

  const activate = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const activateSibling = useCallback((offset: 1 | -1) => {
    setActiveId((current) => {
      const list = tabsRef.current;
      if (list.length === 0) return current;
      const index = list.findIndex((tab) => tab.id === current);
      // No resolvable active tab: enter the cycle from the end being stepped
      // into, so "previous" still moves leftwards (to the last tab).
      const next =
        index === -1
          ? offset === 1
            ? list[0]
            : list[list.length - 1]
          : list[(index + offset + list.length) % list.length];
      return next.id;
    });
  }, []);

  const activateNext = useCallback(() => activateSibling(1), [activateSibling]);

  const activatePrevious = useCallback(
    () => activateSibling(-1),
    [activateSibling]
  );

  const close = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const index = prev.findIndex((tab) => tab.id === id);
        if (index === -1) return prev;
        const closed = prev[index];
        const next = prev.filter((tab) => tab.id !== id);
        if (closed) pushClosed([closed]);
        setActiveId((current) =>
          current === id
            ? (next[index - 1]?.id ?? next[index]?.id ?? null)
            : current
        );
        return next;
      });
    },
    [pushClosed]
  );

  const closeOthers = useCallback(
    (keep: string) => {
      setTabs((prev) => {
        if (!prev.some((tab) => tab.id === keep)) return prev;
        pushClosed(prev.filter((tab) => tab.id !== keep));
        return prev.filter((tab) => tab.id === keep);
      });
      setActiveId(keep);
    },
    [pushClosed]
  );

  const closeOthersInRuntime = useCallback(
    (keep: string, runtimeId: RuntimeId) => {
      setTabs((prev) => {
        const keepTab = prev.find((tab) => tab.id === keep);
        if (keepTab?.runtimeId !== runtimeId) return prev;
        const closed = prev.filter(
          (tab) => tab.runtimeId === runtimeId && tab.id !== keep
        );
        if (closed.length === 0) return prev;
        pushClosed(closed);
        return prev.filter(
          (tab) => tab.runtimeId !== runtimeId || tab.id === keep
        );
      });
      setActiveId(keep);
    },
    [pushClosed]
  );

  const closeAll = useCallback(() => {
    pushClosed(tabsRef.current);
    setTabs([]);
    setActiveId(null);
  }, [pushClosed]);

  const closeAllInRuntime = useCallback(
    (runtimeId: RuntimeId) => {
      setTabs((prev) => {
        const { next, removed } = removeTabsForRuntime(prev, runtimeId);
        if (removed.length === 0) return prev;
        pushClosed(removed);
        setActiveId((current) =>
          _activeAfterRemovingTabs(current, next, removed)
        );
        return next;
      });
    },
    [pushClosed]
  );

  const closeRuntime = useCallback(
    (runtimeId: RuntimeId) => {
      setTabs((prev) => {
        const { next, removed: closed } = removeTabsForRuntime(prev, runtimeId);
        if (closed.length === 0) return prev;
        pushClosed(closed);
        setActiveId((current) =>
          _activeAfterRemovingTabs(current, next, closed)
        );
        return next;
      });
    },
    [pushClosed]
  );

  const discardRuntime = useCallback((runtimeId: RuntimeId) => {
    setTabs((prev) => {
      const { next, removed } = removeTabsForRuntime(prev, runtimeId);
      if (removed.length === 0) return prev;
      setActiveId((current) =>
        _activeAfterRemovingTabs(current, next, removed)
      );
      return next;
    });
  }, []);

  const reopenClosed = useCallback(async () => {
    const group = closedStack.current.pop();
    if (!group) return;
    const restored = group.map(_fromPersisted).filter(Boolean) as AppTab[];
    const runtimeIds = await _availableRuntimeIds();
    const alive = (
      await Promise.all(
        restored.map(async (tab) =>
          (await _tabExists(tab, runtimeIds)) ? tab : null
        )
      )
    ).filter((tab): tab is AppTab => tab !== null);
    if (alive.length === 0) return;
    setTabs((prev) =>
      _dedupeTabs([
        ...prev,
        ...alive.filter(
          (tab) => !prev.some((current) => current.id === tab.id)
        ),
      ])
    );
    setActiveId(alive[alive.length - 1]?.id ?? null);
  }, []);

  const reorder = useCallback((from: number, to: number) => {
    setTabs((prev) => {
      if (from === to || from < 0 || to < 0) return prev;
      if (from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1) as [AppTab];
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const reorderInRuntime = useCallback(
    (from: number, to: number, runtimeId: RuntimeId) => {
      setTabs((prev) => {
        if (from === to || from < 0 || to < 0) return prev;
        const scopedIndexes = prev
          .map((tab, index) => ({ tab, index }))
          .filter(({ tab }) => tab.runtimeId === runtimeId)
          .map(({ index }) => index);
        if (from >= scopedIndexes.length || to >= scopedIndexes.length) {
          return prev;
        }
        const next = [...prev];
        const [moved] = next.splice(scopedIndexes[from], 1) as [AppTab];
        const nextScopedIndexes = next
          .map((tab, index) => ({ tab, index }))
          .filter(({ tab }) => tab.runtimeId === runtimeId)
          .map(({ index }) => index);
        const insertAt = nextScopedIndexes[to] ?? next.length;
        next.splice(insertAt, 0, moved);
        return next;
      });
    },
    []
  );

  const handleRemove = useCallback(
    (removed: string, runtimeId: RuntimeId = "local") => {
      setTabs((prev) => {
        const next = prev.filter(
          (tab) =>
            tab.type !== "thread" ||
            tab.runtimeId !== runtimeId ||
            !_isUnder(tab.path, removed)
        );
        if (next.length === prev.length) return prev;
        setActiveId((current) =>
          current !== null &&
          prev.some(
            (tab) =>
              tab.id === current &&
              tab.type === "thread" &&
              tab.runtimeId === runtimeId &&
              _isUnder(tab.path, removed)
          )
            ? (next[next.length - 1]?.id ?? null)
            : current
        );
        return next;
      });
    },
    []
  );

  const handleMove = useCallback(
    (from: string, to: string, runtimeId: RuntimeId = "local") => {
      const rewrite = (p: string): string =>
        p === from ? to : _isUnder(p, from) ? to + p.slice(from.length) : p;

      const currentTabs = tabsRef.current;
      const sourceTabs = currentTabs.filter(
        (tab): tab is ThreadTab =>
          tab.type === "thread" &&
          tab.runtimeId === runtimeId &&
          _isUnder(tab.path, from)
      );
      const destinationTabs = currentTabs.filter(
        (tab): tab is ThreadTab =>
          tab.type === "thread" &&
          tab.runtimeId === runtimeId &&
          _isUnder(tab.path, to)
      );
      const sourceIsOpen = sourceTabs.length > 0;

      if (sourceIsOpen) {
        for (const tab of destinationTabs) {
          discardedPaneIds.current.add(tab.paneId);
        }
      }

      setTabs((prev) => {
        const next = prev.flatMap((tab): AppTab[] => {
          if (tab.type !== "thread" || tab.runtimeId !== runtimeId)
            return [tab];
          if (_isUnder(tab.path, from)) {
            const path = rewrite(tab.path);
            return [{ ...tab, id: _threadTabId(path, tab.runtimeId), path }];
          }
          if (!_isUnder(tab.path, to)) return [tab];
          if (sourceIsOpen) return [];
          return [{ ...tab, refreshNonce: (tab.refreshNonce ?? 0) + 1 }];
        });
        return _dedupeTabs(next);
      });
      setActiveId((current) => {
        const activeTab = currentTabs.find((tab) => tab.id === current);
        if (activeTab?.type !== "thread" || activeTab.runtimeId !== runtimeId)
          return current;
        if (_isUnder(activeTab.path, from)) {
          return _threadTabId(rewrite(activeTab.path), activeTab.runtimeId);
        }
        if (!_isUnder(activeTab.path, to) || !sourceIsOpen) return current;

        const replacement = sourceTabs.find(
          (tab) => rewrite(tab.path) === activeTab.path
        );
        return replacement
          ? _threadTabId(rewrite(replacement.path), replacement.runtimeId)
          : _threadTabId(rewrite(sourceTabs[0].path), sourceTabs[0].runtimeId);
      });
    },
    []
  );

  const consumeDiscardedPane = useCallback((paneId: string) => {
    if (!discardedPaneIds.current.has(paneId)) return false;
    discardedPaneIds.current.delete(paneId);
    return true;
  }, []);

  const handleTraceTitleChange = useCallback(
    (
      projectId: string,
      traceKey: string,
      title: string,
      runtimeId: RuntimeId = "local"
    ) => {
      const id = _traceTabId(projectId, traceKey, runtimeId);
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === id && tab.type === "trace" ? { ...tab, title } : tab
        )
      );
    },
    []
  );

  const refresh = useCallback((id: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === id
          ? { ...tab, refreshNonce: (tab.refreshNonce ?? 0) + 1 }
          : tab
      )
    );
  }, []);

  return {
    tabs,
    activeId,
    open,
    openTrace,
    close,
    closeOthers,
    closeOthersInRuntime,
    closeAll,
    closeAllInRuntime,
    closeRuntime,
    discardRuntime,
    reorder,
    reorderInRuntime,
    activate,
    activateNext,
    activatePrevious,
    refresh,
    consumeDiscardedPane,
    handleRemove,
    handleMove,
    handleTraceTitleChange,
    reopenClosed,
  };
}
