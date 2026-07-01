import { PencilIcon } from "lucide-react";
import { memo, useCallback, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { Tooltip } from "../../tooltip";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { useThreadStore, useThreadStoreActions } from "../stores";

function _TitleEditor({
  className,
  readonly,
}: {
  className?: string;
  readonly?: boolean;
}) {
  const title = useThreadStore((s) => s.thread.title);
  const { updateTitle } = useThreadStoreActions();
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const cancelledRef = useRef(false);

  const startEditing = useCallback(() => {
    setDraftTitle(title ?? "");
    setEditing(true);
  }, [title]);

  const commitEditing = useCallback(() => {
    updateTitle(draftTitle === "" ? undefined : draftTitle);
    setEditing(false);
  }, [draftTitle, updateTitle]);

  const cancelEditing = useCallback(() => {
    cancelledRef.current = true;
    setEditing(false);
  }, []);

  const handleBlur = useCallback(() => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    commitEditing();
  }, [commitEditing]);

  if (readonly) {
    return (
      <div className={cn("truncate text-sm font-medium", className)}>
        {title ?? "Untitled"}
      </div>
    );
  }

  if (editing) {
    return (
      <Input
        autoFocus
        aria-label="Thread title"
        className={cn(
          "h-8 border-transparent bg-transparent! text-sm font-medium shadow-none focus-visible:ring-0",
          className
        )}
        value={draftTitle}
        placeholder="Untitled"
        onBlur={handleBlur}
        onChange={(event) => {
          setDraftTitle(event.target.value);
        }}
        onFocus={(event) => {
          event.currentTarget.select();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            cancelEditing();
          }
        }}
      />
    );
  }

  return (
    <div className={cn("group flex w-full items-center gap-1", className)}>
      <div
        className="min-w-0 truncate text-sm font-medium"
        role="button"
        tabIndex={0}
        aria-label="Edit thread title"
        onClick={startEditing}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            startEditing();
          }
        }}
      >
        <Tooltip content="Click to edit title">
          {title ? (
            <span>{title}</span>
          ) : (
            <span className="text-muted-foreground">Untitled</span>
          )}
        </Tooltip>
      </div>
      <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
        <Tooltip content="Edit title">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Edit thread title"
            onClick={startEditing}
          >
            <PencilIcon className="size-3" />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}

export const TitleEditor = memo(_TitleEditor);
