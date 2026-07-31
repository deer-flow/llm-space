import type { Thread } from "@llm-space/core";
import { useEffect, useRef } from "react";

import type { ThreadStore } from "./stores";

export interface ThreadPlaygroundEventCallbacks {
  onChange?: (thread: Thread) => void;
  onStreamingStart?: () => void;
  onStreamingEnd?: () => void;
}

export function useThreadPlaygroundEvents(
  store: ThreadStore,
  callbacks: ThreadPlaygroundEventCallbacks
): void {
  const onChangeRef = useRef(callbacks.onChange);
  const onStreamingStartRef = useRef(callbacks.onStreamingStart);
  const onStreamingEndRef = useRef(callbacks.onStreamingEnd);

  // Keep the callback refs current after each commit. The store subscription
  // below reads them only when the store fires (always post-commit), so a
  // passive effect is enough and avoids mutating refs during render.
  useEffect(() => {
    onChangeRef.current = callbacks.onChange;
    onStreamingStartRef.current = callbacks.onStreamingStart;
    onStreamingEndRef.current = callbacks.onStreamingEnd;
  });

  useEffect(() => {
    return store.subscribe((state, prevState) => {
      const { status } = state;
      const prevStatus = prevState.status;

      if (status === "running" && prevStatus === "idle") {
        onStreamingStartRef.current?.();
      }

      if (status === "idle" && prevStatus === "running") {
        // Flush thread changes that were suppressed while streaming.
        onChangeRef.current?.(state.thread);
        // The store may synchronously attach terminal run metadata immediately
        // after setting idle. Let those updates reach onChange before a host
        // treats the pane as settled and tears down its runtime.
        queueMicrotask(() => onStreamingEndRef.current?.());
        return;
      }

      if (state.thread === prevState.thread || status === "running") {
        return;
      }

      onChangeRef.current?.(state.thread);
    });
  }, [store]);
}
