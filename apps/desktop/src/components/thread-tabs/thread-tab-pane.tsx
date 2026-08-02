"use client";

import type { Thread } from "@llm-space/core";
import { ThreadPlayground } from "@llm-space/ui/components/thread-playground";
import { parentOf, threadPathForTitle } from "@llm-space/ui/lib/thread-file";
import { cn } from "@llm-space/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { createFileSystemClient, createRpcTransport } from "@/client";
import type { RuntimeId } from "@/shared/runtime";

import { runFileMutationWithGuard } from "../file-system-tree-view/file-mutation-guard";

import type { PaneLifecycleHost } from "./pane-lifecycle-host";
import { SerializedPersistence } from "./serialized-persistence";
import { settleStreamingPane } from "./settle-streaming-pane";
import { isFatalThreadLoadError } from "./thread-load-state";
import { usePaneRefreshAcknowledgement } from "./use-pane-refresh-ack";

interface ThreadTabPaneProps {
  tabId: string;
  paneId: string;
  path: string;
  runtimeId: RuntimeId;
  active: boolean;
  lifecycleHost: PaneLifecycleHost;
  mutationRevision: number;
  /**
   * Bumped by the tab "Refresh" action to reload this thread from disk,
   * discarding any un-saved in-memory edits.
   */
  refreshNonce?: number;
  onMove?: (from: string, to: string, runtimeId: RuntimeId) => void;
  /** Close this pane's tab, e.g. after its thread fails to load. */
  onClose: (tabId: string) => void;
  /** Return true once when an overwritten pane must drop pending writes. */
  consumeDiscardedPane?: (paneId: string) => boolean;
}

/**
 * One open thread. Each pane owns its own fetch + debounced persistence and stays
 * mounted while inactive (hidden via CSS) so its store, undo history, and any
 * in-progress streaming run survive tab switches.
 */
function _ThreadTabPane({
  tabId,
  paneId,
  path,
  runtimeId,
  active,
  lifecycleHost,
  mutationRevision,
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
  const loadError = isFatalThreadLoadError({
    hasThread: thread !== undefined,
    isError,
    isLoading,
  });

  // The tab is opened optimistically (see `useThreadTabs.open`) without
  // pre-checking the file exists, so a since-deleted (or otherwise unreadable)
  // file surfaces here instead: report it and close the tab it was given.
  useEffect(() => {
    if (!loadError) return;
    toast.error("Error", {
      description:
        error instanceof Error ? error.message : `File not found: ${path}`,
    });
    onClose(tabId);
  }, [loadError, error, onClose, path, tabId]);

  // Persist edits back to the same path, debounced so we don't write per keystroke.
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathRef = useRef(path);
  // Keep the latest path in a ref for post-commit reads (debounced write flush,
  // refresh refetch, rename) without mutating during render. Declared before the
  // effects below so they observe the fresh path.
  useEffect(() => {
    pathRef.current = path;
  });
  const [persistenceOwner] = useState<object>(() => ({}));
  const persistence = useMemo(
    () =>
      new SerializedPersistence<Thread>(
        (next) => fs.write(pathRef.current, { ...next, runtimeId }),
        {
          onBusyChange: (busy) =>
            lifecycleHost.onPersistenceChange(
              paneId,
              runtimeId,
              persistenceOwner,
              busy,
              pathRef.current
            ),
          onWriteError: (writeError) => {
            toast.error("Failed to save thread; retrying", {
              description:
                writeError instanceof Error
                  ? writeError.message
                  : "Storage is temporarily unavailable.",
            });
          },
        }
      ),
    [fs, lifecycleHost, paneId, persistenceOwner, runtimeId]
  );

  const flushPending = useCallback(async () => {
    if (writeTimer.current) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
    await persistence.flush();
  }, [persistence]);

  const handleChange = useCallback(
    (next: Thread) => {
      if (
        lifecycleHost.isMutationReserved(
          paneId,
          runtimeId,
          pathRef.current
        )
      ) {
        return;
      }
      persistence.setPending(next);
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        void flushPending();
      }, 500);
    },
    [flushPending, lifecycleHost, paneId, persistence, runtimeId]
  );

  const handleStreamingStart = useCallback(
    (runId?: string) => {
      if (!runId) return false;
      return lifecycleHost.onRunStart(
        paneId,
        runtimeId,
        runId,
        pathRef.current
      );
    },
    [lifecycleHost, paneId, runtimeId]
  );
  const handleStreamingEnd = useCallback(
    (runId?: string) => {
      if (!runId) return;
      void settleStreamingPane(flushPending, () => {
        lifecycleHost.onRunSettled(paneId, runId);
      }).catch((error) => {
        toast.error("Failed to save completed run", {
          description:
            error instanceof Error ? error.message : "Please try again.",
        });
      });
    },
    [flushPending, lifecycleHost, paneId]
  );

  // Flush pending edits on a normal close. An editor displaced by an overwrite
  // instead drops them so stale destination content cannot replace the moved file.
  useEffect(() => {
    return () => {
      if (consumeDiscardedPane?.(paneId)) {
        if (writeTimer.current) clearTimeout(writeTimer.current);
        writeTimer.current = null;
        persistence.discardPending();
        return;
      }
      void flushPending();
    };
  }, [consumeDiscardedPane, flushPending, paneId, persistence]);

  // "Refresh" the thread from disk: re-read the file and remount the playground
  // on a fresh store (via reloadKey), discarding any in-memory edits. Driven by
  // the per-tab refreshNonce, so it works even for an inactive (hidden) pane.
  const [reloadKey, setReloadKey] = useState(0);
  const appliedRefreshRef = useRef(refreshNonce);
  const { markCommitPending, settleWithoutCommit } =
    usePaneRefreshAcknowledgement({
      paneId,
      reloadKey,
      onSettled: lifecycleHost.onRefreshSettled,
    });
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
    persistence.discardPending();
    void (async () => {
      try {
        await persistence.flush();
        await qc.refetchQueries({
          queryKey: ["thread", runtimeId, pathRef.current],
          exact: true,
        });
        markCommitPending();
        setReloadKey((key) => key + 1);
      } catch (error) {
        toast.error("Error", {
          description:
            error instanceof Error ? error.message : "Failed to refresh",
        });
        settleWithoutCommit();
      }
    })();
  }, [
    markCommitPending,
    persistence,
    refreshNonce,
    qc,
    runtimeId,
    settleWithoutCommit,
  ]);

  const handleRenameTitle = useCallback(
    async (title: string): Promise<boolean> => {
      const from = pathRef.current;
      const to = threadPathForTitle(from, title);
      if (to === from) {
        return true;
      }

      return runFileMutationWithGuard({
        acquireMutation: lifecycleHost.acquireMutation,
        paths: [from, to],
        runtimeId,
        action: "renaming this thread",
        blockedResult: false,
        mutate: async () => {
          await flushPending();
          await fs.mv(from, to);
          const moved = await fs.read(to);
          await fs.write(to, { ...moved, runtimeId });
          qc.setQueryData(["thread", runtimeId, to], moved);
          void qc.invalidateQueries({ queryKey: ["fs", runtimeId, "ls"] });
          void qc.invalidateQueries({
            queryKey: ["thread", runtimeId, from],
          });
          if (parentOf(from) !== parentOf(to)) {
            void qc.invalidateQueries({
              queryKey: ["fs", runtimeId, "ls", parentOf(from)],
            });
          }
          return true;
        },
        reconcile: (renamed) =>
          renamed ? onMove?.(from, to, runtimeId) : undefined,
      });
    },
    [flushPending, fs, lifecycleHost, onMove, qc, runtimeId]
  );

  const mutationReserved = useMemo(
    () => {
      void mutationRevision;
      return lifecycleHost.isMutationReserved(paneId, runtimeId, path);
    },
    [lifecycleHost, mutationRevision, paneId, path, runtimeId]
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
        readonly={mutationReserved}
        active={active}
        transport={rpcTransport}
        runtimeId={runtimeId}
        onChange={handleChange}
        onStreamingStart={handleStreamingStart}
        onStreamingEnd={handleStreamingEnd}
        onRenameTitle={handleRenameTitle}
      />
    </div>
  );
}

export const ThreadTabPane = memo(_ThreadTabPane);
