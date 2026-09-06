import { create } from "zustand";

import { ConfirmDialog } from "@llm-space/ui/components/confirm-dialog";
import { useHostServices } from "@llm-space/ui/host";

import { usePlaygroundLabels } from "./thread-playground/playground-labels";

interface FirecrawlLimitDialogState {
  open: boolean;
  openDialog: () => void;
  setOpen: (open: boolean) => void;
}

/**
 * App-wide singleton controlling the Firecrawl daily-limit dialog. Unlike the
 * per-tab thread store, this is a single global instance because the limit error
 * can fire from multiple call sites (single tool call, "Call all" batch).
 */
const useFirecrawlLimitDialogStore = create<FirecrawlLimitDialogState>(
  (set) => ({
    open: false,
    openDialog: () => set({ open: true }),
    setOpen: (open) => set({ open }),
  })
);

/** Open the dialog from non-React call sites (tool-call catch blocks). */
export function openFirecrawlLimitDialog() {
  useFirecrawlLimitDialogStore.getState().openDialog();
}

/**
 * Mounted once inside `CommandProvider` (see `app/page.tsx`) so its confirm
 * action can dispatch the `openSettings` command.
 */
export function FirecrawlLimitDialog() {
  const open = useFirecrawlLimitDialogStore((state) => state.open);
  const setOpen = useFirecrawlLimitDialogStore((state) => state.setOpen);
  const { actions } = useHostServices();
  const { dialogs } = usePlaygroundLabels();
  const confirm = dialogs.confirmations;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title={confirm.firecrawlLimitTitle}
      description={confirm.firecrawlLimitDescription}
      cancelLabel={confirm.notNow}
      confirmLabel={confirm.configureApiKey}
      confirmVariant="default"
      onConfirm={() => {
        actions.openSettings("search");
        setOpen(false);
      }}
    />
  );
}
