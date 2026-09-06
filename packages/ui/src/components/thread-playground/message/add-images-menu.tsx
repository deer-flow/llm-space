"use client";

import { ClipboardPasteIcon, FileIcon, ImagePlusIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { Button } from "@llm-space/ui/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@llm-space/ui/ui/dropdown-menu";

import { usePlaygroundLabels } from "../playground-labels";
import { useThreadStoreActions } from "../stores/thread-store";

function readImageFile(
  file: File,

  onSuccess: (mimeType: string, data: string) => void
) {
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result as string;
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    const [, mimeType, data] = match ?? [];
    if (mimeType && data) {
      onSuccess(mimeType, data);
    }
  };
  reader.readAsDataURL(file);
}

export function AddImagesMenu({
  messageId,
  disabled,
  onOpenChange,
}: {
  messageId: string;
  disabled?: boolean;
  /** Lets the containing message keep its hover toolbar visible while open. */
  onOpenChange?: (open: boolean) => void;
}) {
  const { dialogs } = usePlaygroundLabels();
  const labels = dialogs.images;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const { addMessageImageContent } = useThreadStoreActions();

  const addImage = useCallback(
    (mimeType: string, data: string) => {
      addMessageImageContent(messageId, mimeType, data);
    },
    [addMessageImageContent, messageId]
  );

  const handleFilesSelected = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files) {
        return;
      }
      for (const file of files) {
        if (file.type.startsWith("image/")) {
          readImageFile(file, addImage);
        }
      }
      event.target.value = "";
    },
    [addImage]
  );

  const handleFromFiles = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFromClipboard = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            const blob = await item.getType(type);
            const file = new File([blob], "clipboard-image", { type });
            readImageFile(file, addImage);
            return;
          }
        }
      }
    } catch {
      // Clipboard access denied or no image available.
    }
  }, [addImage]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange]
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        aria-label={labels.fileInputAria}
        className="hidden"
        onChange={handleFilesSelected}
      />
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={labels.addImageAria}
            disabled={disabled}
          >
            <ImagePlusIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{labels.addImages}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={handleFromFiles}>
            <FileIcon />
            {labels.fromFiles}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleFromClipboard}>
            <ClipboardPasteIcon />
            {labels.fromClipboard}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
