"use client";

import type { FileNode } from "@llm-space/core";
import {
  FilePlus,
  FolderPlus,
  RefreshCw,
  TextCursorInput,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A small clickable icon. Rendered as a `<span role="button">` rather than a
 * real `<button>` because directory rows place actions inside the accordion
 * trigger button, and nesting `<button>` elements is invalid HTML. Pointer and
 * click events are stopped so using an action never drags, toggles, or selects
 * the row.
 */
function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={label}
      title={label}
      className={cn(
        "text-muted-foreground hover:bg-accent hover:text-foreground",
        "inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded"
      )}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          e.preventDefault();
          onClick();
        }
      }}
    >
      {children}
    </span>
  );
}

/** Per-row hover actions: new file / new folder (directories) + delete. */
export function NodeActions({
  node,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
}: {
  node: FileNode;
  onNewFile: (node: FileNode) => void;
  onNewFolder: (node: FileNode) => void;
  onRename: (node: FileNode) => void;
  onDelete: (node: FileNode) => void;
}) {
  const isDir = node.type === "directory";
  return (
    <span className="flex items-center gap-0.5">
      {isDir && (
        <>
          <IconAction label="New file" onClick={() => onNewFile(node)}>
            <FilePlus className="h-3.5 w-3.5" />
          </IconAction>
          <IconAction label="New folder" onClick={() => onNewFolder(node)}>
            <FolderPlus className="h-3.5 w-3.5" />
          </IconAction>
        </>
      )}
      <IconAction label="Rename" onClick={() => onRename(node)}>
        <TextCursorInput className="h-3.5 w-3.5" />
      </IconAction>
      <IconAction label="Delete" onClick={() => onDelete(node)}>
        <Trash2 className="h-3.5 w-3.5" />
      </IconAction>
    </span>
  );
}

/** New file / new folder / refresh actions for the (row-less) storage root. */
export function RootActions({
  onNewFile,
  onNewFolder,
  onRefresh,
}: {
  onNewFile: () => void;
  onNewFolder: () => void;
  onRefresh: () => void;
}) {
  return (
    <span className="flex items-center gap-0.5">
      <IconAction label="New file" onClick={onNewFile}>
        <FilePlus className="h-3.5 w-3.5" />
      </IconAction>
      <IconAction label="New folder" onClick={onNewFolder}>
        <FolderPlus className="h-3.5 w-3.5" />
      </IconAction>
      <IconAction label="Refresh" onClick={onRefresh}>
        <RefreshCw className="h-3.5 w-3.5" />
      </IconAction>
    </span>
  );
}
