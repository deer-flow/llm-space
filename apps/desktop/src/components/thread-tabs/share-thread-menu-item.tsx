import { ContextMenuItem } from "@llm-space/ui/ui/context-menu";

import type { RuntimeId } from "@/shared/runtime";

/** The thread-tab consumer that keeps its selected runtime beside the path. */
export function ShareThreadMenuItem({
  path,
  runtimeId,
  onShare,
}: {
  path: string;
  runtimeId: RuntimeId;
  onShare: (path: string, runtimeId: RuntimeId) => void;
}) {
  return (
    <ContextMenuItem onSelect={() => onShare(path, runtimeId)}>
      Share...
    </ContextMenuItem>
  );
}
