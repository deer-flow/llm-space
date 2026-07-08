"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { useCommands } from "@/commands";
import { electrobun } from "@/lib/electrobun";
import type { UpdateStatusChangedPayload } from "@/shared/updates";

/**
 * One stable toast id so successive update states replace each other instead
 * of stacking.
 */
const UPDATE_TOAST_ID = "app-update";

/**
 * Headless bridge for app-update notifications: listens for the bun-side
 * `updateStatusChanged` RPC messages and surfaces them as toasts. Background
 * checks only surface the final "restart to update" prompt; manual checks
 * (the "Check for Updates…" menu item) also report progress, up-to-date and
 * errors.
 */
export function UpdateNotifications() {
  const { executeCommand } = useCommands();

  useEffect(() => {
    const rpc = electrobun.rpc;
    if (!rpc) return;

    const handleStatus = ({ status, manual }: UpdateStatusChangedPayload) => {
      switch (status.state) {
        case "checking":
          if (manual) {
            toast.loading("Checking for updates…", { id: UPDATE_TOAST_ID });
          }
          return;
        case "downloading":
          if (manual) {
            toast.loading(`Downloading v${status.version}…`, {
              id: UPDATE_TOAST_ID,
            });
          }
          return;
        case "up-to-date":
          if (manual) {
            toast.success(`You're up to date (v${status.version})`, {
              id: UPDATE_TOAST_ID,
            });
          }
          return;
        case "error":
          if (manual) {
            toast.error(`Update check failed: ${status.message}`, {
              id: UPDATE_TOAST_ID,
            });
          }
          return;
        case "ready":
          toast.success(`v${status.version} is ready to install`, {
            id: UPDATE_TOAST_ID,
            duration: Infinity,
            action: {
              label: "Restart",
              onClick: () =>
                executeCommand({ type: "applyUpdateAndRestart", args: {} }),
            },
          });
          return;
      }
    };

    rpc.addMessageListener("updateStatusChanged", handleStatus);
    return () => rpc.removeMessageListener("updateStatusChanged", handleStatus);
  }, [executeCommand]);

  return null;
}
