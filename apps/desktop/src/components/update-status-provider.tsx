"use client";

import { CheckIcon, XIcon } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { electrobun } from "@/lib/electrobun";
import type { UpdateStatusChangedPayload } from "@/shared/updates";

/** GitHub versioned-release page, opened from the "Updated to …" toast. */
const RELEASE_TAG_URL = "https://github.com/deer-flow/llm-space/releases/tag";
// The sonner-typed status flow (checking/downloading/up-to-date/error) shares
// one id so its states morph in place. The ready card is a `toast.custom`
// under a SEPARATE id: reusing one id across a typed toast and a custom toast
// leaks state between them (a success check icon lingering behind the card; a
// later success refusing to replace the card), so each kind owns its id and we
// dismiss the other when switching.
const STATUS_TOAST_ID = "app-update-status";
const READY_TOAST_ID = "app-update-ready";
const READY_TOAST_DURATION_MS = 8000;
// The whole update flow lives bottom-right (the ready card must not cover the
// top toolbar); keep every state there so it never jumps positions.
const UPDATE_TOAST_POSITION = "bottom-right" as const;
const MANUAL_TOAST_OPTS = {
  id: STATUS_TOAST_ID,
  position: UPDATE_TOAST_POSITION,
} as const;

interface UpdateStatusValue {
  /** Version downloaded and ready to install, or null. Drives the badge. */
  readyVersion: string | null;
}

/**
 * The "update ready" toast, rendered as a full custom card matching the
 * onboarding dialog's "Ready to run" panel (dark glass card + emerald check
 * badge + two-line label), with a trailing Restart action. Rendered via
 * `toast.custom`, so it owns the whole card look rather than sonner's default
 * toast chrome.
 */
function _UpdateReadyCard({
  version,
  onRestart,
  onDismiss,
}: {
  version: string;
  onRestart: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex w-[356px] max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-white/15 bg-black/45 p-3.5 text-white shadow-2xl backdrop-blur-md">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-400/18 text-emerald-200">
        <CheckIcon className="size-4" />
      </div>
      <div className="min-w-0 grow">
        <div className="text-sm font-medium">Update ready</div>
        <div className="truncate text-xs text-white/65">
          v{version} is ready to install.
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" onClick={onRestart}>
          Restart
        </Button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="flex size-6 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  );
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
 * - every toast sits bottom-right (out of the top toolbar) and auto-dismisses;
 *   the ready card is a `toast.custom`, the rest are sonner-typed.
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
            toast.dismiss(READY_TOAST_ID);
            toast.loading("Checking for updates…", MANUAL_TOAST_OPTS);
          }
          return;
        case "downloading":
          if (manual) {
            toast.dismiss(READY_TOAST_ID);
            toast.loading(`Downloading v${status.version}…`, MANUAL_TOAST_OPTS);
          }
          return;
        case "up-to-date":
          // No update available now — clear any stale "ready" badge/card (e.g.
          // a downloaded build the feed later rolled back). The bun side
          // reverts the menu item in the same case.
          setReadyVersion(null);
          lastNotifiedVersion.current = null;
          if (manual) {
            toast.dismiss(READY_TOAST_ID);
            toast.success(
              `You're up to date (v${status.version})`,
              MANUAL_TOAST_OPTS
            );
          }
          return;
        case "error":
          if (manual) {
            toast.dismiss(READY_TOAST_ID);
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
          // Clear the typed status toast, then show the custom card under its
          // own id (see the id comment above).
          toast.dismiss(STATUS_TOAST_ID);
          toast.custom(
            (id) => (
              <_UpdateReadyCard
                version={status.version}
                onRestart={restart}
                onDismiss={() => toast.dismiss(id)}
              />
            ),
            {
              id: READY_TOAST_ID,
              position: UPDATE_TOAST_POSITION,
              duration: READY_TOAST_DURATION_MS,
            }
          );
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
