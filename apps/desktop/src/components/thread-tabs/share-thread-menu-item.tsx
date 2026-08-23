import { useI18n } from "@llm-space/ui/lib/i18n";
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
  const { t } = useI18n();
  return (
    <ContextMenuItem onSelect={() => onShare(path, runtimeId)}>
      {t.desktop.shareThreadMenu.share}
    </ContextMenuItem>
  );
}
