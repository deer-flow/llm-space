"use client";

import type { Thread } from "@llm-space/core";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

/** Derive a tab label from a thread file path (basename without `.json`). */
export function tabLabel(path: string): string {
  return path.split("/").pop()!.replace(/\.json$/, "");
}

export interface ThreadTabs {
  /** Open file paths, in tab order. */
  tabs: string[];
  /** Currently focused tab, or `null` when no tabs are open. */
  activePath: string | null;
  /** Open `path` as a tab (adding it if absent) and focus it. */
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
}

/** Returns whether `path` is `base` itself or nested beneath it. */
function _isUnder(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`);
}

export function useThreadTabs(): ThreadTabs {
  const qc = useQueryClient();
  const [tabs, setTabs] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);

  const open = useCallback((path: string) => {
    setTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setActivePath(path);
  }, []);

  const activate = useCallback((path: string) => {
    setActivePath(path);
  }, []);

  const close = useCallback((path: string) => {
    setTabs((prev) => {
      const index = prev.indexOf(path);
      if (index === -1) return prev;
      const next = prev.filter((p) => p !== path);
      // If we closed the active tab, focus its left neighbor (else the right one).
      setActivePath((current) =>
        current === path ? (next[index - 1] ?? next[index] ?? null) : current
      );
      return next;
    });
  }, []);

  const closeOthers = useCallback((keep: string) => {
    setTabs((prev) => (prev.includes(keep) ? [keep] : prev));
    setActivePath((current) => (current === keep ? current : keep));
  }, []);

  const closeAll = useCallback(() => {
    setTabs([]);
    setActivePath(null);
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
  };
}
