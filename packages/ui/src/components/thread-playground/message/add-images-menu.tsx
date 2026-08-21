"use client";

import { ClipboardPasteIcon, FileIcon, ImagePlusIcon } from "lucide-react";
import { useCallback, useRef } from "react";

import { useI18n } from "@llm-space/ui/lib/i18n";
import { Button } from "@llm-space/ui/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@llm-space/ui/ui/dropdown-menu";

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
}: {
  messageId: string;
  disabled?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();
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

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        aria-label={t.playground.message.addImagesInputLabel}
        className="hidden"
        onChange={handleFilesSelected}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t.playground.message.addImageToMessage}
            disabled={disabled}
          >
            <ImagePlusIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t.playground.message.addImages}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={handleFromFiles}>
            <FileIcon />
            {t.playground.message.fromFiles}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleFromClipboard}>
            <ClipboardPasteIcon />
            {t.playground.message.fromClipboard}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
