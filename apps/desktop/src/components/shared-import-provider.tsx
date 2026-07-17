"use client";

import { Button } from "@llm-space/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";
import { Loader2Icon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useCommands } from "@/commands";
import { electrobun } from "@/lib/electrobun";
import type { SharedImportStatusPayload } from "@/shared/shared-import";

/**
 * Drives the deep-link shared-thread import UI. A single listener for the
 * bun-side `sharedImportStatusChanged` messages shows a centered "importing…"
 * modal that the user can Cancel, then on success reveals the imported thread in
 * the tree (expand + select + open + scroll) and toasts. Modeled on
 * {@link UpdateStatusProvider}.
 */
export function SharedImportProvider() {
  const { executeCommand } = useCommands();
  const [importing, setImporting] = useState(false);
  // Set on Cancel so a racing `success` from bun is ignored.
  const cancelledRef = useRef(false);

  useEffect(() => {
    const rpc = electrobun.rpc;
    if (!rpc) return;

    const handle = (payload: SharedImportStatusPayload) => {
      if (payload.status === "importing") {
        cancelledRef.current = false;
        setImporting(true);
        return;
      }
      setImporting(false);
      if (cancelledRef.current) return;
      if (payload.status === "success") {
        executeCommand({
          type: "revealInTree",
          args: { path: payload.path },
        });
        toast.success(
          payload.title ? `Imported "${payload.title}"` : "Thread imported"
        );
      } else {
        toast.error(payload.message);
      }
    };

    rpc.addMessageListener("sharedImportStatusChanged", handle);
    return () => rpc.removeMessageListener("sharedImportStatusChanged", handle);
  }, [executeCommand]);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    setImporting(false);
    electrobun.rpc?.send.cancelSharedImport({});
  }, []);

  return (
    <Dialog
      open={importing}
      onOpenChange={(open) => {
        if (!open) handleCancel();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Importing shared thread</DialogTitle>
          <DialogDescription>
            Fetching and saving it to your workspace…
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center py-4">
          <Loader2Icon className="text-muted-foreground size-6 animate-spin" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
