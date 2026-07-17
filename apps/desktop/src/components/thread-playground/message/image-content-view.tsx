import type { ImageDataContent } from "@llm-space/core";
import { Tooltip } from "@llm-space/ui/components/tooltip";
import { cn } from "@llm-space/ui/lib/utils";
import { Button } from "@llm-space/ui/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@llm-space/ui/ui/dialog";
import { XIcon } from "lucide-react";
import React, { useCallback, useState } from "react";

import { useThreadStoreActions } from "../stores";

const FRAME_SIZE_PX = 192; // size-48

function _ImageContentView({
  image,
  readonly,
  onRemove,
  className,
}: {
  image: ImageDataContent;
  readonly?: boolean;
  onRemove?: () => void;
  className?: string;
}) {
  const [fit, setFit] = useState<"contain" | "cover">("contain");
  const [previewOpen, setPreviewOpen] = useState(false);

  const imageSrc = `data:${image.mimeType};base64,${image.data}`;

  const handleLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth, naturalHeight } = event.currentTarget;
      setFit(
        naturalWidth <= FRAME_SIZE_PX && naturalHeight <= FRAME_SIZE_PX
          ? "contain"
          : "cover"
      );
    },
    []
  );

  const handleRemove = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onRemove?.();
    },
    [onRemove]
  );

  const handleOpenPreview = useCallback(() => {
    setPreviewOpen(true);
  }, []);

  return (
    <>
      <div
        className={cn(
          "group/image relative flex size-48 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border shadow",
          className
        )}
        onClick={handleOpenPreview}
        role="button"
        tabIndex={0}
        aria-label="Open image preview"
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleOpenPreview();
          }
        }}
      >
        <img
          src={imageSrc}
          alt=""
          onLoad={handleLoad}
          className={cn(
            fit === "cover"
              ? "size-full object-cover"
              : "max-h-full max-w-full object-contain"
          )}
        />
        {!readonly && onRemove && (
          <Tooltip content="Remove image">
            <Button
              variant="ghost"
              size="icon-sm"
              className="bg-background/80 absolute top-1 right-1 rounded-full border opacity-0 transition-opacity group-hover/image:opacity-100"
              aria-label="Remove image"
              onClick={handleRemove}
            >
              <XIcon className="size-4" />
            </Button>
          </Tooltip>
        )}
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          className="top-0 left-0 flex h-dvh max-h-none w-dvw max-w-none translate-x-0 translate-y-0 cursor-zoom-out items-center justify-center rounded-none border-0 bg-transparent p-0 shadow-none ring-0 sm:max-w-none"
          showCloseButton
          onClick={() => setPreviewOpen(false)}
        >
          <DialogTitle className="sr-only">Image preview</DialogTitle>
          <img
            src={imageSrc}
            alt=""
            className="max-h-[95vh] max-w-[95vw] cursor-default object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

export const ImageContentView = React.memo(_ImageContentView);

function _ImageContentList({
  messageId,
  images,
  readonly,
  className,
}: {
  messageId: string;
  images: { content: ImageDataContent; contentIndex: number }[];
  readonly?: boolean;
  className?: string;
}) {
  const { removeMessageImageContent } = useThreadStoreActions();

  if (images.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex w-full flex-wrap gap-3 px-3 pt-2", className)}>
      {images.map(({ content, contentIndex }) => (
        <ImageContentView
          key={`${content.mimeType}-${contentIndex}`}
          image={content}
          readonly={readonly}
          onRemove={() => {
            removeMessageImageContent(messageId, contentIndex);
          }}
        />
      ))}
    </div>
  );
}

export const ImageContentList = React.memo(_ImageContentList);
