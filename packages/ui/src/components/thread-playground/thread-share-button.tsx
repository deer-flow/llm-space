import { Share2Icon } from "lucide-react";

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
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      aria-label="Share thread"
      disabled={disabled}
      onClick={() => onShare(createShareThreadAction(path, runtimeId))}
    >
      <Share2Icon className="size-4" />
    </Button>
  );
}
