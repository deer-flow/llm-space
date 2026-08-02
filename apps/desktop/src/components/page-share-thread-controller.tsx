import { lazy, useState } from "react";

import { useRegisterCommands } from "@/commands";
import type { RuntimeId } from "@/shared/runtime";

import { LazyMount } from "./lazy-mount";
import { createShareThreadCommandHandler } from "./share-thread-command-handler";
import type { ShareThreadTarget } from "./share-thread-dialog-flow";

const ShareThreadDialog = lazy(() =>
  import("./share-thread-dialog").then((module) => ({
    default: module.ShareThreadDialog,
  }))
);

/**
 * Owns share-command registration and the dialog's immutable runtime target.
 * The dialog stays mounted after its first open so its close animation and
 * subsequent opens remain instant.
 */
export function PageShareThreadController({
  workspaceRuntimeId,
  getActiveThread,
}: {
  workspaceRuntimeId: RuntimeId;
  getActiveThread: () => ShareThreadTarget | null;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<ShareThreadTarget>({
    path: "",
    runtimeId: "local",
  });

  useRegisterCommands({
    shareThread: createShareThreadCommandHandler({
      getWorkspaceRuntimeId: () => workspaceRuntimeId,
      getActiveThread,
      openDialog: (nextTarget) => {
        setTarget(nextTarget);
        setOpen(true);
      },
    }),
  });

  return (
    <LazyMount open={open}>
      <ShareThreadDialog
        open={open}
        path={target.path}
        runtimeId={target.runtimeId}
        onOpenChange={setOpen}
      />
    </LazyMount>
  );
}
