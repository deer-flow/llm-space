"use client";

import type { Thread } from "@llm-space/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { createRpcTransport, traceClient } from "@/client";
import { ThreadPlayground } from "@/components/thread-playground";
import { cn } from "@/lib/utils";

const rpcTransport = createRpcTransport();

interface TraceTabPaneProps {
  projectId: string;
  traceKey: string;
  active: boolean;
  refreshNonce?: number;
  onClose?: (tabId: string) => void;
}

function _TraceTabPane({
  projectId,
  traceKey,
  active,
  refreshNonce = 0,
  onClose,
}: TraceTabPaneProps) {
  const tabId = `trace:${projectId}:${traceKey}`;
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["trace", "workbench", projectId, traceKey],
    queryFn: () => traceClient.readOrCreateWorkbench(projectId, traceKey),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (!isError) {
      return;
    }
    toast.error("Error", {
      description:
        error instanceof Error ? error.message : "Trace workbench not found",
    });
    onClose?.(tabId);
  }, [error, isError, onClose, tabId]);

  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Thread | null>(null);

  const flushPending = useCallback(async () => {
    if (writeTimer.current) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
    const thread = pending.current;
    pending.current = null;
    if (thread !== null) {
      await traceClient.writeWorkbench(projectId, traceKey, thread);
    }
  }, [projectId, traceKey]);

  const handleChange = useCallback(
    (next: Thread) => {
      pending.current = next;
      if (writeTimer.current) {
        clearTimeout(writeTimer.current);
      }
      writeTimer.current = setTimeout(() => {
        void flushPending();
      }, 500);
    },
    [flushPending]
  );

  useEffect(() => {
    return () => {
      void flushPending();
    };
  }, [flushPending]);

  const [reloadKey, setReloadKey] = useState(0);
  const appliedRefreshRef = useRef(refreshNonce);
  useEffect(() => {
    if (appliedRefreshRef.current === refreshNonce) {
      return;
    }
    appliedRefreshRef.current = refreshNonce;
    if (writeTimer.current) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
    pending.current = null;
    void (async () => {
      try {
        await qc.refetchQueries({
          queryKey: ["trace", "workbench", projectId, traceKey],
          exact: true,
        });
        setReloadKey((key) => key + 1);
      } catch (error) {
        toast.error("Error", {
          description:
            error instanceof Error ? error.message : "Failed to refresh trace",
        });
      }
    })();
  }, [projectId, qc, refreshNonce, traceKey]);

  const trace = data?.trace;
  const contextLine = trace
    ? [
        "Langfuse",
        trace.source.mode === "manual" ? "Manual Import" : "Connected",
        `trace ${trace.source.traceId}`,
        `imported ${new Date(trace.importedAt).toLocaleString()}`,
      ].join(" · ")
    : "Langfuse trace";

  return (
    <div className={cn("flex size-full flex-col", !active && "hidden")}>
      <div className="bg-muted/30 border-b px-3 py-1.5">
        <div className="text-muted-foreground truncate text-[0.6875rem]">
          {contextLine}
        </div>
      </div>
      <ThreadPlayground
        key={reloadKey}
        className="bg-background min-h-0 flex-1 shadow-lg"
        loading={isLoading || !data}
        path={`trace/${projectId}/${traceKey}/workbench.json`}
        title={trace?.title ?? traceKey}
        initialValue={data?.thread}
        active={active}
        transport={rpcTransport}
        onChange={handleChange}
      />
    </div>
  );
}

export const TraceTabPane = memo(_TraceTabPane);
