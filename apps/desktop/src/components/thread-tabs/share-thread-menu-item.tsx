import { ContextMenuItem } from "@llm-space/ui/ui/context-menu";

import type { RuntimeId } from "@/shared/runtime";

/**
 * The thread-tab consumer that keeps its selected runtime beside the path.
 * Hook-free by design (tests invoke it directly); the label arrives from the
 * localized parent menu.
 */
export function ShareThreadMenuItem({
  path,
  runtimeId,
  label,
  onShare,
}: {
  path: string;
  runtimeId: RuntimeId;
  label: string;
  onShare: (path: string, runtimeId: RuntimeId) => void;
}) {
  return (
    <ContextMenuItem onSelect={() => onShare(path, runtimeId)}>
      {label}
    </ContextMenuItem>
  );
}
