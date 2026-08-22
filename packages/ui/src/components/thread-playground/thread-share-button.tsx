import { Share2Icon } from "lucide-react";

import { useI18n } from "@llm-space/ui/lib/i18n";

import { createShareThreadAction } from "../../host";
import type { ShareThreadActionInput } from "../../host/types";
import { Button } from "../../ui/button";

export function ThreadShareButton({
  path,
  runtimeId,
  disabled,
  onShare,
}: {
  path: string;
  runtimeId?: string;
  disabled: boolean;
  onShare: (input: ShareThreadActionInput) => void;
}) {
  const { t } = useI18n();
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      aria-label={t.playground.share.shareThread}
      disabled={disabled}
      onClick={() => onShare(createShareThreadAction(path, runtimeId))}
    >
      <Share2Icon className="size-4" />
    </Button>
  );
}
