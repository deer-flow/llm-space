import { useCallback } from "react";
import type { KeyboardEvent } from "react";

import { useThreadStore, useThreadStoreActions } from "./stores";

/**
 * Keyboard shortcuts for the thread playground, wired to the container's
 * keydown capture handler.
 */
export function useShortcuts({ readonly }: { readonly: boolean }) {
  const status = useThreadStore((s) => s.status);
  const { run, abort } = useThreadStoreActions();

  return useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!(event.metaKey || event.ctrlKey || event.altKey)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "enter") {
        if (readonly) {
          return;
        }
        if (_isEditableTarget(event.target)) {
          return;
        }
        event.preventDefault();
        if (status === "running") {
          try {
            abort();
          } catch {
            // Ignored
          }
        } else {
          void run();
        }
        return;
      }
    },
    [abort, readonly, run, status]
  );
}

function _isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.closest(".cm-editor") !== null ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}
