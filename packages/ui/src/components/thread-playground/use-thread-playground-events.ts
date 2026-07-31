import type { Thread } from "@llm-space/core";
import { useLayoutEffect, useRef } from "react";

import type { ThreadStore } from "./stores";

export interface ThreadPlaygroundEventCallbacks {
  onChange?: (thread: Thread) => void;
  onStreamingStart?: (runId: string) => boolean | void;
  onStreamingEnd?: (runId: string) => void;
}

export function useThreadPlaygroundEvents(
  store: ThreadStore,
  callbacks: ThreadPlaygroundEventCallbacks
): void {
  const onChangeRef = useRef(callbacks.onChange);
  const onStreamingStartRef = useRef(callbacks.onStreamingStart);
  const onStreamingEndRef = useRef(callbacks.onStreamingEnd);
  const rejectedRunIdsRef = useRef(new Set<string>());
  const runStartThreadsRef = useRef(new Map<string, Thread>());

  // Install the latest callbacks and ownership subscription before the pane
  // becomes interactive. A run can enter `preparing` immediately after commit,
  // before passive effects have had a chance to flush.
  useLayoutEffect(() => {
    onChangeRef.current = callbacks.onChange;
    onStreamingStartRef.current = callbacks.onStreamingStart;
    onStreamingEndRef.current = callbacks.onStreamingEnd;
  });

  useLayoutEffect(() => {
    const unsubscribe = store.subscribe((state, prevState) => {
      const { status } = state;
      const prevStatus = prevState.status;

      if (status === "preparing" && prevStatus === "idle") {
        const runId = state.activeRunId;
        if (runId) runStartThreadsRef.current.set(runId, state.thread);
        if (runId && onStreamingStartRef.current?.(runId) === false) {
          rejectedRunIdsRef.current.add(runId);
          store.getState().abort();
        }
      }

      if (
        status === "idle" &&
        (prevStatus === "preparing" || prevStatus === "running")
      ) {
        const runId = prevState.activeRunId;
        const startThread = runId
          ? runStartThreadsRef.current.get(runId)
          : undefined;
        if (runId) runStartThreadsRef.current.delete(runId);
        if (runId && rejectedRunIdsRef.current.delete(runId)) return;
        // Flush changes suppressed while streaming, but do not manufacture a
        // persistence revision for a model/preflight failure that left the
        // thread untouched. onStreamingEnd still provides the durability
        // barrier for a pending edit that predates the run.
        if (startThread !== undefined && state.thread !== startThread) {
          onChangeRef.current?.(state.thread);
        }
        // The store may synchronously attach terminal run metadata immediately
        // after setting idle. Let those updates reach onChange before a host
        // treats the pane as settled and tears down its runtime.
        if (runId) {
          queueMicrotask(() => onStreamingEndRef.current?.(runId));
        }
        return;
      }

      if (state.thread === prevState.thread || status === "running") {
        return;
      }

      onChangeRef.current?.(state.thread);
    });
    return () => {
      // Abort while the subscription is still attached so the preparing/running
      // -> idle transition reaches the host's terminal persistence barrier.
      // This is the final defense for any future owner teardown that misses a
      // page-level mutation reservation.
      store.getState().abort();
      unsubscribe();
    };
  }, [store]);
}
