import { useCallback } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";

import { useThreadStore, useThreadStoreActions } from "./stores";

/**
 * First-use gate for auto-run tool execution. Each tool name is approved once
 * per thread session (i.e. until the tab closes); denying stops the episode
 * with the tool calls left pending for manual handling.
 */
export function AutoRunApprovalDialog({
  threadTitle,
}: {
  threadTitle: string;
}) {
  const approval = useThreadStore((s) => s.autoRunApproval);
  const { respondToAutoRunApproval } = useThreadStoreActions();
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        respondToAutoRunApproval(false);
      }
    },
    [respondToAutoRunApproval]
  );
  const handleConfirm = useCallback(() => {
    respondToAutoRunApproval(true);
  }, [respondToAutoRunApproval]);
  return (
    <ConfirmDialog
      open={approval !== null}
      onOpenChange={handleOpenChange}
      title="Allow auto-run to call tools?"
      description={
        <>
          Auto-run in “{threadTitle}” wants to call{" "}
          <span className="text-foreground font-mono">
            {(approval?.toolNames ?? []).join(", ")}
          </span>
          . Allowed tools run without asking again until this tab closes.
        </>
      }
      cancelLabel="Stop auto-run"
      confirmLabel="Allow"
      confirmVariant="default"
      onConfirm={handleConfirm}
    />
  );
}
