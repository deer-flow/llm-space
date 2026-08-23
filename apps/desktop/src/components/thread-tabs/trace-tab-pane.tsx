"use client";

import type { Thread } from "@llm-space/core";
import { ThreadPlayground } from "@llm-space/ui/components/thread-playground";
import { Tooltip } from "@llm-space/ui/components/tooltip";
import { useI18n } from "@llm-space/ui/lib/i18n";
import { cn } from "@llm-space/ui/lib/utils";
import { Button } from "@llm-space/ui/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { createRpcTransport, traceClient } from "@/client";
import type { RuntimeId } from "@/shared/runtime";
import type { TraceRecord } from "@/shared/traces";

import type { PaneLifecycleHost } from "./pane-lifecycle-host";
import { SerializedPersistence } from "./serialized-persistence";
import { settleStreamingPane } from "./settle-streaming-pane";
import { usePaneRefreshAcknowledgement } from "./use-pane-refresh-ack";

interface TraceTabPaneProps {
  projectId: string;
  traceKey: string;
  runtimeId: RuntimeId;
  active: boolean;
  viewMounted: boolean;
  lifecycleHost: PaneLifecycleHost;
  mutationRevision: number;
  refreshNonce?: number;
  onClose?: (tabId: string) => void;
  onRenameTitle?: (
    projectId: string,
    traceKey: string,
    title: string,
    runtimeId: RuntimeId
  ) => void;
}

function _TraceTabPane({
  projectId,
  traceKey,
  runtimeId,
  active,
  viewMounted,
  lifecycleHost,
  mutationRevision,
  refreshNonce = 0,
  onClose,
  onRenameTitle,
}: TraceTabPaneProps) {
  const { t } = useI18n();
  const tabId = `trace:${runtimeId}:${projectId}:${traceKey}`;
  const rpcTransport = createRpcTransport(runtimeId);
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["trace", runtimeId, "workbench", projectId, traceKey],
    queryFn: () =>
      traceClient.readOrCreateWorkbench(projectId, traceKey, runtimeId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (!isError) {
      return;
    }
    toast.error(t.common.error, {
      description:
        error instanceof Error
          ? error.message
          : t.desktop.traceTabPane.notFound,
    });
    onClose?.(tabId);
  }, [error, isError, onClose, t, tabId]);

  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [persistenceOwner] = useState<object>(() => ({}));
  const persistence = useMemo(
    () =>
      new SerializedPersistence<Thread>(
        (next) =>
          traceClient.writeWorkbench(projectId, traceKey, next, runtimeId),
        {
          onBusyChange: (busy) =>
            lifecycleHost.onPersistenceChange(
              tabId,
              runtimeId,
              persistenceOwner,
              busy
            ),
          onWriteError: (writeError) => {
            toast.error(t.desktop.traceTabPane.saveRetrying, {
              description:
                writeError instanceof Error
                  ? writeError.message
                  : t.desktop.traceTabPane.storageUnavailable,
            });
          },
        }
      ),
    [
      lifecycleHost,
      persistenceOwner,
      projectId,
      runtimeId,
      t,
      tabId,
      traceKey,
    ]
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
      if (lifecycleHost.isMutationReserved(tabId, runtimeId)) return;
      persistence.setPending(next);
      if (writeTimer.current) {
        clearTimeout(writeTimer.current);
      }
      writeTimer.current = setTimeout(() => {
        void flushPending();
      }, 500);
    },
    [flushPending, lifecycleHost, persistence, runtimeId, tabId]
  );

  const handleStreamingStart = useCallback(
    (runId?: string) => {
      if (!runId) return false;
      return lifecycleHost.onRunStart(tabId, runtimeId, runId);
    },
    [lifecycleHost, runtimeId, tabId]
  );
  const handleStreamingEnd = useCallback(
    (runId?: string) => {
      if (!runId) return;
      void settleStreamingPane(flushPending, () => {
        lifecycleHost.onRunSettled(tabId, runId);
      }).catch((error) => {
        toast.error(t.desktop.traceTabPane.saveRunFailed, {
          description:
            error instanceof Error ? error.message : t.common.pleaseTryAgain,
        });
      });
    },
    [flushPending, lifecycleHost, t, tabId]
  );

  const handleRenameTitle = useCallback(
    async (title: string): Promise<boolean> => {
      await flushPending();
      const next = await traceClient.updateTraceTitle(
        projectId,
        traceKey,
        title,
        runtimeId
      );
      qc.setQueryData(
        ["trace", runtimeId, "workbench", projectId, traceKey],
        next
      );
      void qc.invalidateQueries({
        queryKey: ["trace", runtimeId, "traces", projectId],
      });
      onRenameTitle?.(projectId, traceKey, next.trace.title, runtimeId);
      return true;
    },
    [flushPending, onRenameTitle, projectId, qc, runtimeId, traceKey]
  );

  useEffect(() => {
    return () => {
      void flushPending();
    };
  }, [flushPending]);

  const [reloadKey, setReloadKey] = useState(0);
  const appliedRefreshRef = useRef(refreshNonce);
  const { markCommitPending, settleWithoutCommit } =
    usePaneRefreshAcknowledgement({
      paneId: tabId,
      reloadKey,
      onSettled: lifecycleHost.onRefreshSettled,
    });
  useEffect(() => {
    if (appliedRefreshRef.current === refreshNonce) {
      return;
    }
    appliedRefreshRef.current = refreshNonce;
    if (writeTimer.current) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
    persistence.discardPending();
    void (async () => {
      try {
        await persistence.flush();
        await qc.refetchQueries({
          queryKey: ["trace", runtimeId, "workbench", projectId, traceKey],
          exact: true,
        });
        markCommitPending();
        setReloadKey((key) => key + 1);
      } catch (error) {
        toast.error(t.common.error, {
          description:
            error instanceof Error
              ? error.message
              : t.desktop.traceTabPane.refreshFailed,
        });
        settleWithoutCommit();
      }
    })();
  }, [
    markCommitPending,
    persistence,
    projectId,
    qc,
    refreshNonce,
    runtimeId,
    settleWithoutCommit,
    t,
    traceKey,
  ]);

  const trace = data?.trace;
  const mutationReserved = useMemo(() => {
    void mutationRevision;
    return lifecycleHost.isMutationReserved(tabId, runtimeId);
  }, [lifecycleHost, mutationRevision, runtimeId, tabId]);

  return (
    <ThreadPlayground
      storeKey={reloadKey}
      className={cn(
        "bg-background flex size-full min-h-0 flex-1 flex-col shadow-lg",
        !active && "hidden"
      )}
      loading={isLoading || !data}
      path={`trace/${projectId}/${traceKey}/workbench.json`}
      title={trace?.title ?? traceKey}
      headerDetails={trace ? <TraceHeaderDetails trace={trace} /> : null}
      initialValue={data?.thread}
      readonly={mutationReserved}
      active={active}
      viewMounted={viewMounted}
      transport={rpcTransport}
      runtimeId={runtimeId}
      onChange={handleChange}
      onStreamingStart={handleStreamingStart}
      onStreamingEnd={handleStreamingEnd}
      onRenameTitle={handleRenameTitle}
      validateTitle={(value) => _validateTraceTitle(value, t)}
    />
  );
}

export const TraceTabPane = memo(_TraceTabPane);

function _TraceHeaderDetails({ trace }: { trace: TraceRecord }) {
  const { t } = useI18n();
  const traceId = trace.source.traceId;
  const copyTraceId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(traceId);
      toast.success(t.desktop.traceTabPane.idCopied);
    } catch {
      toast.error(t.desktop.traceTabPane.copyFailed);
    }
  }, [t, traceId]);
  return (
    <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[0.6875rem]">
      <span className="border-border bg-muted/60 text-foreground max-w-72 min-w-0 truncate rounded-full border px-2 py-0.5 font-mono text-[0.625rem]">
        Langfuse
      </span>
      <span className="shrink-0">·</span>
      <span className="border-border bg-muted/60 text-foreground max-w-72 min-w-0 truncate rounded-full border px-2 py-0.5 font-mono text-[0.625rem]">
        {new Date(trace.updatedAt).toLocaleString()}
      </span>
      <span className="hidden shrink-0 sm:inline">·</span>
      <span
        className="border-border bg-muted/60 text-foreground max-w-72 min-w-0 truncate rounded-full border px-2 py-0.5 font-mono text-[0.625rem]"
        title={traceId}
      >
        {traceId}
      </span>
      <Tooltip content={t.desktop.traceTabPane.copyId}>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t.desktop.traceTabPane.copyId}
          onClick={copyTraceId}
        >
          <CopyIcon className="size-3" />
        </Button>
      </Tooltip>
    </div>
  );
}

const TraceHeaderDetails = memo(_TraceHeaderDetails);

function _validateTraceTitle(
  value: string,
  t: ReturnType<typeof useI18n>["t"]
) {
  const title = value.trim();
  if (!title) {
    return {
      valid: false,
      value: title,
      error: t.desktop.traceTabPane.titleRequired,
    };
  }
  if ([...title].some((char) => char.charCodeAt(0) < 32)) {
    return {
      valid: false,
      value: title,
      error: t.desktop.traceTabPane.titleControlCharacter,
    };
  }
  return { valid: true, value: title };
}
