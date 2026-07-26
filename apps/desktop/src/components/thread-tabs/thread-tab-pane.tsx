"use client";

import type { Thread } from "@llm-space/core";
import { ThreadPlayground } from "@llm-space/ui/components/thread-playground";
import { parentOf, threadPathForTitle } from "@llm-space/ui/lib/thread-file";
import { cn } from "@llm-space/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { createFileSystemClient, createRpcTransport } from "@/client";
import type { RuntimeId } from "@/shared/runtime";

interface ThreadTabPaneProps {
  paneId: string;
  path: string;
  runtimeId: RuntimeId;
  active: boolean;
  /**
   * Bumped by the tab "Refresh" action to reload this thread from disk,
   * discarding any un-saved in-memory edits.
   */
  refreshNonce?: number;
  onMove?: (from: string, to: string, runtimeId: RuntimeId) => void;
  /** Close this pane's tab, e.g. after its thread fails to load. */
  onClose?: (path: string) => void;
  /** Return true once when an overwritten pane must drop pending writes. */
  consumeDiscardedPane?: (paneId: string) => boolean;
}

/**
 * One open thread. Each pane owns its own fetch + debounced persistence and stays
 * mounted while inactive (hidden via CSS) so its store, undo history, and any
 * in-progress streaming run survive tab switches.
 */
export function ThreadTabPane({
  paneId,
  path,
  runtimeId,
  active,
  refreshNonce = 0,
  onMove,
  onClose,
  consumeDiscardedPane,
}: ThreadTabPaneProps) {
  const qc = useQueryClient();
  const fs = useMemo(() => createFileSystemClient(runtimeId), [runtimeId]);
  const rpcTransport = useMemo(
    () => createRpcTransport(runtimeId),
    [runtimeId]
  );
  const {
    data: thread,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["thread", runtimeId, path],
    queryFn: () => fs.read(path),
    // A workspace file can change on disk outside the app, so never serve a
    // cached copy: read fresh on every open, and drop the entry the moment its
    // tab closes. (The global 30s staleTime still covers models / directory ls.)
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const loadError = isError || (!isLoading && !thread);

  // The tab is opened optimistically (see `useThreadTabs.open`) without
  // pre-checking the file exists, so a since-deleted (or otherwise unreadable)
  // file surfaces here instead: report it and close the tab it was given.
  useEffect(() => {
    if (!loadError) return;
    toast.error("Error", {
      description:
        error instanceof Error ? error.message : `File not found: ${path}`,
    });
    onClose?.(path);
  }, [loadError, error, path, onClose]);

  // Persist edits back to the same path, debounced so we don't write per keystroke.
  // `pending` holds the latest unsaved thread so we can flush it on unmount.
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Thread | null>(null);
  const pathRef = useRef(path);
  // Keep the latest path in a ref for post-commit reads (debounced write flush,
  // refresh refetch, rename) without mutating during render. Declared before the
  // effects below so they observe the fresh path.
  useEffect(() => {
    pathRef.current = path;
  });

  const flushPending = useCallback(async () => {
    if (writeTimer.current) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
    const thread = pending.current;
    pending.current = null;
    if (thread !== null) {
      await fs.write(pathRef.current, { ...thread, runtimeId });
    }
  }, [fs, runtimeId]);

  const handleChange = useCallback(
    (next: Thread) => {
      pending.current = next;
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        void flushPending();
      }, 500);
    },
    [flushPending]
  );

  // Flush pending edits on a normal close. An editor displaced by an overwrite
  // instead drops them so stale destination content cannot replace the moved file.
  useEffect(() => {
    return () => {
      if (consumeDiscardedPane?.(paneId)) {
        if (writeTimer.current) clearTimeout(writeTimer.current);
        writeTimer.current = null;
        pending.current = null;
        return;
      }
      void flushPending();
    };
  }, [consumeDiscardedPane, flushPending, paneId]);

  // "Refresh" the thread from disk: re-read the file and remount the playground
  // on a fresh store (via reloadKey), discarding any in-memory edits. Driven by
  // the per-tab refreshNonce, so it works even for an inactive (hidden) pane.
  const [reloadKey, setReloadKey] = useState(0);
  const appliedRefreshRef = useRef(refreshNonce);
  useEffect(() => {
    if (appliedRefreshRef.current === refreshNonce) {
      return;
    }
    appliedRefreshRef.current = refreshNonce;
    // A refresh takes whatever is on disk, so drop any un-flushed local edit —
    // otherwise the pending debounce would write it back over the reloaded file.
    if (writeTimer.current) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
    pending.current = null;
    void (async () => {
      try {
        await qc.refetchQueries({
          queryKey: ["thread", runtimeId, pathRef.current],
          exact: true,
        });
        setReloadKey((key) => key + 1);
      } catch (error) {
        toast.error("Error", {
          description:
            error instanceof Error ? error.message : "Failed to refresh",
        });
      }
    })();
  }, [refreshNonce, qc, runtimeId]);

  const handleRenameTitle = useCallback(
    async (title: string): Promise<boolean> => {
      const from = pathRef.current;
      const to = threadPathForTitle(from, title);
      if (to === from) {
        return true;
      }

      await flushPending();
      await fs.mv(from, to);
      const moved = await fs.read(to);
      await fs.write(to, { ...moved, runtimeId });
      qc.setQueryData(["thread", runtimeId, to], moved);
      void qc.invalidateQueries({ queryKey: ["fs", runtimeId, "ls"] });
      void qc.invalidateQueries({ queryKey: ["thread", runtimeId, from] });
      if (parentOf(from) !== parentOf(to)) {
        void qc.invalidateQueries({
          queryKey: ["fs", runtimeId, "ls", parentOf(from)],
        });
      }
      onMove?.(from, to, runtimeId);
      return true;
    },
    [flushPending, fs, onMove, qc, runtimeId]
  );

  if (loadError) {
    return (
      <div
        className={cn(
          "bg-background text-muted-foreground flex size-full items-center justify-center text-sm",
          !active && "hidden"
        )}
      >
        Failed to load thread.
      </div>
    );
  }

  return (
    <div className={cn("size-full", !active && "hidden")}>
      <ThreadPlayground
        key={reloadKey}
        className="bg-background size-full shadow-lg"
        loading={isLoading}
        path={path}
        initialValue={thread}
        active={active}
        transport={rpcTransport}
        runtimeId={runtimeId}
        onChange={handleChange}
        onRenameTitle={handleRenameTitle}
      />
    </div>
  );
}
