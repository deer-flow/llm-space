"use client";

import type { Thread } from "@llm-space/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyIcon } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { createRpcTransport, traceClient } from "@/client";
import { ThreadPlayground } from "@/components/thread-playground";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TraceRecord } from "@/shared/traces";

const rpcTransport = createRpcTransport();

interface TraceTabPaneProps {
  projectId: string;
  traceKey: string;
  active: boolean;
  refreshNonce?: number;
  onClose?: (tabId: string) => void;
  onRenameTitle?: (projectId: string, traceKey: string, title: string) => void;
}

function _TraceTabPane({
  projectId,
  traceKey,
  active,
  refreshNonce = 0,
  onClose,
  onRenameTitle,
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

  const handleRenameTitle = useCallback(
    async (title: string): Promise<boolean> => {
      await flushPending();
      const next = await traceClient.updateTraceTitle(
        projectId,
        traceKey,
        title
      );
      qc.setQueryData(["trace", "workbench", projectId, traceKey], next);
      void qc.invalidateQueries({ queryKey: ["trace", "traces", projectId] });
      onRenameTitle?.(projectId, traceKey, next.trace.title);
      return true;
    },
    [flushPending, onRenameTitle, projectId, qc, traceKey]
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

  return (
    <div className={cn("flex size-full flex-col", !active && "hidden")}>
      <ThreadPlayground
        key={reloadKey}
        className="bg-background min-h-0 flex-1 shadow-lg"
        loading={isLoading || !data}
        path={`trace/${projectId}/${traceKey}/workbench.json`}
        title={trace?.title ?? traceKey}
        headerDetails={trace ? <TraceHeaderDetails trace={trace} /> : null}
        initialValue={data?.thread}
        active={active}
        transport={rpcTransport}
        onChange={handleChange}
        onRenameTitle={handleRenameTitle}
        validateTitle={_validateTraceTitle}
      />
    </div>
  );
}

export const TraceTabPane = memo(_TraceTabPane);

function _TraceHeaderDetails({ trace }: { trace: TraceRecord }) {
  const traceId = trace.source.traceId;
  const copyTraceId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(traceId);
      toast.success("Trace ID copied");
    } catch {
      toast.error("Could not copy trace ID");
    }
  }, [traceId]);
  const sourceLabel =
    trace.source.mode === "manual" ? "Manual Import" : "Connected";
  return (
    <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[0.6875rem]">
      <span className="shrink-0">Langfuse</span>
      <span className="shrink-0">·</span>
      <span className="shrink-0">{sourceLabel}</span>
      <span className="shrink-0">·</span>
      <span className="hidden shrink-0 sm:inline">
        imported {new Date(trace.importedAt).toLocaleString()}
      </span>
      <span className="hidden shrink-0 sm:inline">·</span>
      <span
        className="border-border bg-muted/60 text-foreground min-w-0 max-w-72 truncate rounded-full border px-2 py-0.5 font-mono text-[0.625rem]"
        title={traceId}
      >
        {traceId}
      </span>
      <Tooltip content="Copy Trace ID">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Copy trace ID"
          onClick={copyTraceId}
        >
          <CopyIcon className="size-3" />
        </Button>
      </Tooltip>
    </div>
  );
}

const TraceHeaderDetails = memo(_TraceHeaderDetails);

function _validateTraceTitle(value: string) {
  const title = value.trim();
  if (!title) {
    return { valid: false, value: title, error: "Trace title is required." };
  }
  if ([...title].some((char) => char.charCodeAt(0) < 32)) {
    return {
      valid: false,
      value: title,
      error: "Trace title contains a control character.",
    };
  }
  return { valid: true, value: title };
}
