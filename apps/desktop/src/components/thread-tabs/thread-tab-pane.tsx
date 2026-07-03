"use client";

import type { Thread } from "@llm-space/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { createRpcTransport, localFs } from "@/client";
import { ThreadPlayground } from "@/components/thread-playground";
import { parentOf, threadPathForTitle } from "@/lib/thread-file";
import { cn } from "@/lib/utils";

// One transport for the app: stream agent runs over Electrobun RPC to the bun
// process (there is no HTTP server in the desktop app).
const rpcTransport = createRpcTransport();

interface ThreadTabPaneProps {
  path: string;
  active: boolean;
  /**
   * Bumped by the tab "Refresh" action to reload this thread from disk,
   * discarding any un-saved in-memory edits.
   */
  refreshNonce?: number;
  onMove?: (from: string, to: string) => void;
}

/**
 * One open thread. Each pane owns its own fetch + debounced persistence and stays
 * mounted while inactive (hidden via CSS) so its store, undo history, and any
 * in-progress streaming run survive tab switches.
 */
export function ThreadTabPane({
  path,
  active,
  refreshNonce = 0,
  onMove,
}: ThreadTabPaneProps) {
  const qc = useQueryClient();
  const { data: thread, isLoading } = useQuery({
    queryKey: ["thread", path],
    queryFn: () => localFs.read(path),
    // A workspace file can change on disk outside the app, so never serve a
    // cached copy: read fresh on every open, and drop the entry the moment its
    // tab closes. (The global 30s staleTime still covers models / directory ls.)
    staleTime: 0,
    gcTime: 0,
  });

  // Persist edits back to the same path, debounced so we don't write per keystroke.
  // `pending` holds the latest unsaved thread so we can flush it on unmount.
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Thread | null>(null);
  const pathRef = useRef(path);
  pathRef.current = path;

  const flushPending = useCallback(async () => {
    if (writeTimer.current) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
    const thread = pending.current;
    pending.current = null;
    if (thread !== null) {
      await localFs.write(pathRef.current, thread);
    }
  }, []);

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

  // Flush any pending write when the tab closes so the last edit is never dropped.
  useEffect(() => {
    return () => {
      void flushPending();
    };
  }, [flushPending]);

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
          queryKey: ["thread", pathRef.current],
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
  }, [refreshNonce, qc]);

  const handleRenameTitle = useCallback(
    async (title: string): Promise<boolean> => {
      const from = pathRef.current;
      const to = threadPathForTitle(from, title);
      if (to === from) {
        return true;
      }

      await flushPending();
      await localFs.mv(from, to);
      const moved = await localFs.read(to);
      await localFs.write(to, moved);
      qc.setQueryData(["thread", to], moved);
      void qc.invalidateQueries({ queryKey: ["fs", "local", "ls"] });
      void qc.invalidateQueries({ queryKey: ["thread", from] });
      if (parentOf(from) !== parentOf(to)) {
        void qc.invalidateQueries({
          queryKey: ["fs", "local", "ls", parentOf(from)],
        });
      }
      onMove?.(from, to);
      return true;
    },
    [flushPending, onMove, qc]
  );

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
        onChange={handleChange}
        onRenameTitle={handleRenameTitle}
      />
    </div>
  );
}
