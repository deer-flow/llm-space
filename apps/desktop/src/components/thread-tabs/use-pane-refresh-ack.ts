import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * A refresh reservation may be released only after the keyed replacement owner
 * has committed. Mark immediately before changing `reloadKey`; the following
 * layout effect acknowledges that commit to the page-level tracker.
 */
export function usePaneRefreshAcknowledgement({
  paneId,
  reloadKey,
  onSettled,
}: {
  paneId: string;
  reloadKey: number;
  onSettled?: (paneId: string) => void;
}): {
  markCommitPending: () => void;
  settleWithoutCommit: () => void;
} {
  const commitPendingRef = useRef(false);
  useLayoutEffect(() => {
    if (!commitPendingRef.current) return;
    commitPendingRef.current = false;
    onSettled?.(paneId);
  }, [onSettled, paneId, reloadKey]);

  const markCommitPending = useCallback(() => {
    commitPendingRef.current = true;
  }, []);
  const settleWithoutCommit = useCallback(() => {
    commitPendingRef.current = false;
    onSettled?.(paneId);
  }, [onSettled, paneId]);
  return { markCommitPending, settleWithoutCommit };
}
