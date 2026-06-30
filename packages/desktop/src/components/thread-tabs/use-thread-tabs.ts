"use client";

import type { Thread } from "@llm-space/core";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { localFs } from "@/client";

/** Derive a tab label from a thread file path (basename without `.json`). */
export function tabLabel(path: string): string {
  return path.split("/").pop()!.replace(/\.json$/, "");
}

export interface ThreadTabs {
  /** Open file paths, in tab order. */
  tabs: string[];
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

/** localStorage key under which the open tab paths are persisted. */
const STORAGE_KEY = "llm-space:open-tabs";

/** Read the persisted tab paths; returns `[]` when unavailable or malformed. */
function _loadPersistedTabs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
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
  const qc = useQueryClient();
  const [tabs, setTabs] = useState<string[]>(_loadPersistedTabs);
  const [activePath, setActivePath] = useState<string | null>(
    () => _loadPersistedTabs()[0] ?? null
  );

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
    _savePersistedTabs(tabs);
  }, [tabs]);

  // On mount, drop any restored tabs whose files no longer exist on disk. The
  // persistence effect above then rewrites the cleaned list back to storage.
  useEffect(() => {
    const restored = tabsRef.current;
    if (restored.length === 0) return;
    let cancelled = false;
    void Promise.all(
      restored.map(async (p) => ((await _fileExists(p)) ? p : null))
    ).then((checked) => {
      if (cancelled) return;
      const alive = checked.filter((p): p is string => p !== null);
      if (alive.length !== restored.length) setTabs(alive);
      // After a successful restore, focus the first surviving tab.
      setActivePath(alive[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const open = useCallback(async (path: string) => {
    // Re-focusing an already-open tab needs no existence check.
    if (tabsRef.current.includes(path)) {
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
    setTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setActivePath(path);
  }, []);

  const activate = useCallback((path: string) => {
    setActivePath(path);
  }, []);

  const close = useCallback(
    (path: string) => {
      setTabs((prev) => {
        const index = prev.indexOf(path);
        if (index === -1) return prev;
        const next = prev.filter((p) => p !== path);
        pushClosed([path]);
        // If we closed the active tab, focus its left neighbor (else the right one).
        setActivePath((current) =>
          current === path ? (next[index - 1] ?? next[index] ?? null) : current
        );
        return next;
      });
    },
    [pushClosed]
  );

  const closeOthers = useCallback(
    (keep: string) => {
      setTabs((prev) => {
        if (!prev.includes(keep)) return prev;
        pushClosed(prev.filter((p) => p !== keep));
        return [keep];
      });
      setActivePath((current) => (current === keep ? current : keep));
    },
    [pushClosed]
  );

  const closeAll = useCallback(() => {
    pushClosed(tabsRef.current);
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
    setTabs((prev) => [...prev, ...alive.filter((p) => !prev.includes(p))]);
    setActivePath(alive[alive.length - 1] ?? null);
  }, []);

  const reorder = useCallback((from: number, to: number) => {
    setTabs((prev) => {
      if (from === to || from < 0 || to < 0) return prev;
      if (from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1) as [string];
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const handleRemove = useCallback((removed: string) => {
    setTabs((prev) => {
      const next = prev.filter((p) => !_isUnder(p, removed));
      if (next.length === prev.length) return prev;
      setActivePath((current) =>
        current !== null && _isUnder(current, removed)
          ? (next[next.length - 1] ?? null)
          : current
      );
      return next;
    });
  }, []);

  const handleMove = useCallback(
    (from: string, to: string) => {
      const rewrite = (p: string): string =>
        p === from ? to : _isUnder(p, from) ? to + p.slice(from.length) : p;

      setTabs((prev) => {
        if (!prev.some((p) => _isUnder(p, from))) return prev;
        // Carry the read cache to the new key so the playground doesn't reload.
        for (const p of prev) {
          const next = rewrite(p);
          if (next === p) continue;
          const cached = qc.getQueryData<Thread>(["thread", p]);
          if (cached !== undefined) qc.setQueryData(["thread", next], cached);
        }
        return prev.map(rewrite);
      });
      setActivePath((current) => (current === null ? current : rewrite(current)));
    },
    [qc]
  );

  return {
    tabs,
    activePath,
    open,
    close,
    closeOthers,
    closeAll,
    reorder,
    activate,
    handleRemove,
    handleMove,
    reopenClosed,
  };
}
