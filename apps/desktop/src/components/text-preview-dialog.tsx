import { memo } from "react";

import { CodeEditor } from "@/components/code-editor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type TextPreviewMode = "code" | "markdown";

function _TextPreviewDialog({
  open,
  onOpenChange,
  title = "Text preview",
  value,
  mode = "code",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  value: string;
  mode?: TextPreviewMode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] w-[85vw] max-w-none! flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 p-3">
          <CodeEditor
            className="h-full opacity-100!"
            hideFocusRing
            hideBorder
            language={mode === "markdown" ? "markdown" : undefined}
            readonly
            value={value}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const TextPreviewDialog = memo(_TextPreviewDialog);
