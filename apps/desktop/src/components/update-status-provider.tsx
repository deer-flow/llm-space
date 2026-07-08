"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { useCommands } from "@/commands";
import { electrobun } from "@/lib/electrobun";
import type { UpdateStatusChangedPayload } from "@/shared/updates";

/** GitHub versioned-release page, opened from the "Updated to …" toast. */
const RELEASE_TAG_URL = "https://github.com/llm-space/llm-space/releases/tag";
/** One stable id so successive states of one flow replace each other. */
const UPDATE_TOAST_ID = "app-update";
const READY_TOAST_DURATION_MS = 8000;
// sonner keeps a toast's last position when re-created under the same id, so
// the manual flow must set position explicitly — otherwise it inherits the
// bottom-right left behind by a prior background "ready".
const MANUAL_TOAST_OPTS = {
  id: UPDATE_TOAST_ID,
  position: "top-center",
} as const;

interface UpdateStatusValue {
  /** Version downloaded and ready to install, or null. Drives the badge. */
  readyVersion: string | null;
}

const UpdateStatusContext = createContext<UpdateStatusValue | null>(null);

/**
 * Owns app-update UI state for the whole page. A single listener for the
 * bun-side `updateStatusChanged` messages drives two things: transient toasts
 * and the persistent `readyVersion` (consumed by {@link UpdateIndicator}).
 *
 * Transient vs. persistent are deliberately split (the badge is the durable
 * affordance, toasts never linger):
 * - manual checks (menu) surface the full checking/downloading/up-to-date/error
 *   flow; background checks stay silent except for the first "ready".
 * - a background "ready" for an already-announced version only lights the
 *   badge; a manual check always re-toasts.
 * - the background "ready" toast sits bottom-right (out of the top toolbar);
 *   manual toasts use the default top-center. Both auto-dismiss.
 */
export function UpdateStatusProvider({ children }: { children: ReactNode }) {
  const { executeCommand } = useCommands();
  const [readyVersion, setReadyVersion] = useState<string | null>(null);
  const lastNotifiedVersion = useRef<string | null>(null);

  const restart = useCallback(
    () => executeCommand({ type: "applyUpdateAndRestart", args: {} }),
    [executeCommand]
  );

  useEffect(() => {
    const rpc = electrobun.rpc;
    if (!rpc) return;

    const handle = ({ status, manual }: UpdateStatusChangedPayload) => {
      switch (status.state) {
        case "checking":
          if (manual) {
            toast.loading("Checking for updates…", MANUAL_TOAST_OPTS);
          }
          return;
        case "downloading":
          if (manual) {
            toast.loading(`Downloading v${status.version}…`, MANUAL_TOAST_OPTS);
          }
          return;
        case "up-to-date":
          // No update available now — clear any stale "ready" badge (e.g. a
          // downloaded build the feed later rolled back). The bun side reverts
          // the menu item in the same case.
          setReadyVersion(null);
          lastNotifiedVersion.current = null;
          if (manual) {
            toast.success(
              `You're up to date (v${status.version})`,
              MANUAL_TOAST_OPTS
            );
          }
          return;
        case "error":
          if (manual) {
            toast.error(`Update check failed: ${status.message}`, {
              ...MANUAL_TOAST_OPTS,
            });
          }
          return;
        case "ready": {
          setReadyVersion(status.version);
          const alreadyAnnounced =
            lastNotifiedVersion.current === status.version;
          // A background re-check of a version we already toasted just keeps
          // the badge lit — no repeat toast (the Cursor anti-pattern).
          if (!manual && alreadyAnnounced) return;
          lastNotifiedVersion.current = status.version;
          toast.success(`Update ready — v${status.version}`, {
            id: UPDATE_TOAST_ID,
            position: manual ? "top-center" : "bottom-right",
            duration: READY_TOAST_DURATION_MS,
            action: { label: "Restart", onClick: restart },
          });
          return;
        }
      }
    };

    rpc.addMessageListener("updateStatusChanged", handle);
    return () => rpc.removeMessageListener("updateStatusChanged", handle);
  }, [restart]);

  // "We just updated" — pulled once on mount, race-free vs. the fire-and-forget
  // status messages (the bun signal is computed at startup, before we listen).
  useEffect(() => {
    const rpc = electrobun.rpc;
    if (!rpc) return;
    let cancelled = false;
    void rpc.request.pendingInstalledVersion({}).then((version) => {
      if (cancelled || !version) return;
      toast.success(`Updated to v${version}`, {
        action: {
          label: "Release notes",
          onClick: () =>
            executeCommand({
              type: "openLink",
              args: { url: `${RELEASE_TAG_URL}/v${version}` },
            }),
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [executeCommand]);

  return (
    <UpdateStatusContext.Provider value={{ readyVersion }}>
      {children}
    </UpdateStatusContext.Provider>
  );
}

export function useUpdateStatus(): UpdateStatusValue {
  const ctx = useContext(UpdateStatusContext);
  if (!ctx) {
    throw new Error("useUpdateStatus must be used within UpdateStatusProvider");
  }
  return ctx;
}
