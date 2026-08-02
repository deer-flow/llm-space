import type { ShareThreadCommand } from "@/shared/commands";
import type { RuntimeId } from "@/shared/runtime";

import type { ShareThreadTarget } from "./share-thread-dialog-flow";
import { resolveShareThreadTarget } from "./thread-tabs/tab-runtime-scope";

interface ShareThreadCommandHandlerDependencies {
  getWorkspaceRuntimeId: () => RuntimeId;
  getActiveThread: () => ShareThreadTarget | null;
  openDialog: (target: ShareThreadTarget) => void;
}

/** The Page-level command handler shared by specific and active-tab entrypoints. */
export function createShareThreadCommandHandler({
  getWorkspaceRuntimeId,
  getActiveThread,
  openDialog,
}: ShareThreadCommandHandlerDependencies) {
  return (args: ShareThreadCommand["args"]): void => {
    const target = resolveShareThreadTarget(
      args,
      getWorkspaceRuntimeId(),
      getActiveThread()
    );
    if (target) openDialog(target);
  };
}
