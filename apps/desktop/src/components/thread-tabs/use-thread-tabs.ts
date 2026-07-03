"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { localFs } from "@/client";
import { threadTitleFromPath } from "@/lib/thread-file";

export interface ThreadTab {
  id: string;
  path: string;
  /** Bumped by `refresh(path)` to force the pane to reload the thread from disk. */
  refreshNonce?: number;
}

/** Derive a tab label from a thread file path (basename without `.json`). */
export function tabLabel(path: string): string {
  return threadTitleFromPath(path);
}

export interface ThreadTabs {
  /** Open file paths, in tab order. */
  tabs: ThreadTab[];
  /** Currently focused tab, or `null` when no tabs are open. */
  activePath: string | null;
  /**
   * Open `path` as a tab (adding it if absent) and focus it. Verifies the file
   * exists first; if it doesn't, surfaces an error and opens nothing.
   */
  open: (path: string) => void;
  /** Close `path`; if it was active, focus its left (else right) neighbor. */
  close: (path: string) => void;
  /** Close every open tab except `keep`, which becomes active. */
  closeOthers: (keep: string) => void;
  /** Close every open tab. */
  closeAll: () => void;
  /** Move the tab at `from` to `to` within the tab order. */
  reorder: (from: number, to: number) => void;
  /** Focus an already-open tab. */
  activate: (path: string) => void;
  /** Reload the tab's thread from disk, discarding any un-saved in-memory edits. */
  refresh: (path: string) => void;
  /** Tree delete: close the tab for `removed` and any tab beneath it. */
  handleRemove: (removed: string) => void;
  /** Tree rename/move: rewrite tab paths under `from` → `to`. */
  handleMove: (from: string, to: string) => void;
  /**
   * Pop the most recent close group off the in-memory stack and reopen its
   * files, silently skipping any that no longer exist. No-op when empty.
   */
  reopenClosed: () => void;
}

/** localStorage keys under which the open tabs and active tab are persisted. */
const STORAGE_KEY = "llm-space:open-tabs";
const ACTIVE_KEY = "llm-space:active-tab";

let nextTabId = 0;

function _createTab(path: string): ThreadTab {
  nextTabId += 1;
  return { id: `tab-${nextTabId}`, path };
}

/**
 * Read the persisted tab paths. A missing key means there are no open tabs yet,
 * so the welcome screen remains visible on first launch.
 */
function _loadPersistedTabs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === "string");
  } catch {
    return [];
  }
}

/** Persist the open tab paths, ignoring any storage failure. */
function _savePersistedTabs(tabs: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  } catch {
    // Storage unavailable (private mode, quota) ⇒ persistence is best-effort.
  }
}

/** Read the persisted active tab path, or `null` when unset/unavailable. */
function _loadPersistedActive(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

/** Persist the active tab path (or clear it when `null`), ignoring failures. */
function _savePersistedActive(path: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (path === null) window.localStorage.removeItem(ACTIVE_KEY);
    else window.localStorage.setItem(ACTIVE_KEY, path);
  } catch {
    // Best-effort, same as `_savePersistedTabs`.
  }
}

/** Returns whether `path` is `base` itself or nested beneath it. */
function _isUnder(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`);
}

/** Whether `path` currently resolves to a file in the local storage. */
async function _fileExists(path: string): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  const parent = slash === -1 ? "" : path.slice(0, slash);
  try {
    const siblings = await localFs.ls(parent);
    return siblings.some((n) => n.path === path && n.type === "file");
  } catch {
    // Parent directory gone (or any ls failure) ⇒ the file isn't openable.
    return false;
  }
}

export function useThreadTabs(): ThreadTabs {
  const [tabs, setTabs] = useState<ThreadTab[]>(() =>
    _loadPersistedTabs().map(_createTab)
  );
  const [activePath, setActivePath] = useState<string | null>(() => {
    const restored = _loadPersistedTabs();
    const active = _loadPersistedActive();
    // Honor the persisted active tab when it's still among the open tabs;
    // otherwise fall back to the first tab.
    return active !== null && restored.includes(active)
      ? active
      : (restored[0] ?? null);
  });

  // Read the latest tabs inside the async `open` without a stale closure.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  // Closed-tab groups, newest last. Each close pushes one group of paths.
  const closedStack = useRef<string[][]>([]);
  const pushClosed = useCallback((paths: string[]) => {
    if (paths.length > 0) closedStack.current.push(paths);
  }, []);

  // Persist the open tabs after any change (open/close/reorder/move/…).
  useEffect(() => {
    _savePersistedTabs(tabs.map((tab) => tab.path));
  }, [tabs]);

  // Persist the active tab so it is re-focused on the next launch.
  useEffect(() => {
    _savePersistedActive(activePath);
  }, [activePath]);

  // On mount, drop any restored tabs whose files no longer exist on disk. The
  // persistence effect above then rewrites the cleaned list back to storage.
  useEffect(() => {
    const restored = tabsRef.current;
    const restoredActive = activePath;
    if (restored.length === 0) return;
    let cancelled = false;
    void Promise.all(
      restored.map(async (tab) => ((await _fileExists(tab.path)) ? tab : null))
    ).then((checked) => {
      if (cancelled) return;
      const alive = checked.filter((tab): tab is ThreadTab => tab !== null);
      if (alive.length !== restored.length) setTabs(alive);
      // Keep the restored active tab when it survived; otherwise the first.
      const alivePaths = alive.map((tab) => tab.path);
      setActivePath(
        restoredActive !== null && alivePaths.includes(restoredActive)
          ? restoredActive
          : (alive[0]?.path ?? null)
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const open = useCallback(async (path: string) => {
    // Re-focusing an already-open tab needs no existence check.
    if (tabsRef.current.some((tab) => tab.path === path)) {
      setActivePath(path);
      return;
    }
    // Verify the file exists before opening a tab for it; a stale tree (or a
    // race with an external delete) would otherwise open a pane whose read
    // fails.
    if (!(await _fileExists(path))) {
      toast.error("Error", { description: `File not found: ${path}` });
      return;
    }
    setTabs((prev) =>
      prev.some((tab) => tab.path === path) ? prev : [...prev, _createTab(path)]
    );
    setActivePath(path);
  }, []);

  const activate = useCallback((path: string) => {
    setActivePath(path);
  }, []);

  const close = useCallback(
    (path: string) => {
      setTabs((prev) => {
        const index = prev.findIndex((tab) => tab.path === path);
        if (index === -1) return prev;
        const next = prev.filter((tab) => tab.path !== path);
        pushClosed([path]);
        // If we closed the active tab, focus its left neighbor (else the right one).
        setActivePath((current) =>
          current === path
            ? (next[index - 1]?.path ?? next[index]?.path ?? null)
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
        if (!prev.some((tab) => tab.path === keep)) return prev;
        pushClosed(
          prev.filter((tab) => tab.path !== keep).map((tab) => tab.path)
        );
        return prev.filter((tab) => tab.path === keep);
      });
      setActivePath((current) => (current === keep ? current : keep));
    },
    [pushClosed]
  );

  const closeAll = useCallback(() => {
    pushClosed(tabsRef.current.map((tab) => tab.path));
    setTabs([]);
    setActivePath(null);
  }, [pushClosed]);

  const reopenClosed = useCallback(async () => {
    const group = closedStack.current.pop();
    if (!group) return;
    // Verify each file still exists, preserving the group's original order.
    const alive = (
      await Promise.all(
        group.map(async (p) => ((await _fileExists(p)) ? p : null))
      )
    ).filter((p): p is string => p !== null);
    if (alive.length === 0) return;
    setTabs((prev) => [
      ...prev,
      ...alive
        .filter((path) => !prev.some((tab) => tab.path === path))
        .map(_createTab),
    ]);
    setActivePath(alive[alive.length - 1] ?? null);
  }, []);

  const reorder = useCallback((from: number, to: number) => {
    setTabs((prev) => {
      if (from === to || from < 0 || to < 0) return prev;
      if (from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1) as [ThreadTab];
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const handleRemove = useCallback((removed: string) => {
    setTabs((prev) => {
      const next = prev.filter((tab) => !_isUnder(tab.path, removed));
      if (next.length === prev.length) return prev;
      setActivePath((current) =>
        current !== null && _isUnder(current, removed)
          ? (next[next.length - 1]?.path ?? null)
          : current
      );
      return next;
    });
  }, []);

  const handleMove = useCallback((from: string, to: string) => {
    const rewrite = (p: string): string =>
      p === from ? to : _isUnder(p, from) ? to + p.slice(from.length) : p;

    setTabs((prev) => {
      if (!prev.some((tab) => _isUnder(tab.path, from))) return prev;
      // Thread reads are uncached, so there's no read cache to carry to the new
      // key. Each pane keeps its in-memory store across the rename and re-reads
      // the new path from disk.
      return prev.map((tab) => ({ ...tab, path: rewrite(tab.path) }));
    });
    setActivePath((current) => (current === null ? current : rewrite(current)));
  }, []);

  // Bump the tab's refreshNonce; the pane watches it and reloads from disk.
  const refresh = useCallback((path: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.path === path
          ? { ...tab, refreshNonce: (tab.refreshNonce ?? 0) + 1 }
          : tab
      )
    );
  }, []);

  return {
    tabs,
    activePath,
    open,
    close,
    closeOthers,
    closeAll,
    reorder,
    activate,
    refresh,
    handleRemove,
    handleMove,
    reopenClosed,
  };
}
