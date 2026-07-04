"use client";

import type { FileNode } from "@llm-space/core";
import {
  Copy,
  FilePlus,
  FolderOpen,
  FolderPlus,
  Import,
  MoreHorizontal,
  RefreshCw,
  SettingsIcon,
  TextCursorInput,
  Trash2,
} from "lucide-react";

import { useCommands } from "@/commands";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const _isWindows =
  typeof navigator !== "undefined" && /Win/i.test(navigator.userAgent);

/**
 * The OS file manager's name, for the "Reveal in …" menu label. Windows calls
 * it Explorer; macOS (and our Linux fallback) say Finder.
 */
const REVEAL_LABEL = _isWindows ? "Reveal in Explorer" : "Reveal in Finder";

/** The "Move to …" delete label, matching the OS trash's name. */
const MOVE_TO_TRASH_LABEL = _isWindows
  ? "Move to Recycle Bin"
  : "Move to Trash";

/** Shared styling for the small square hover-action triggers. */
const actionClass = cn(
  "text-muted-foreground hover:bg-accent hover:text-foreground",
  "inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded"
);

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
      className={actionClass}
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

/**
 * The "..." overflow menu trigger. Like {@link IconAction} it renders as a
 * non-button element (`asChild`) so it can live inside the directory accordion
 * trigger, and stops pointer/click propagation so opening the menu doesn't drag
 * or toggle the row. Default behavior is left intact so Radix can open the menu.
 */
function MoreActionsTrigger({ label }: { label: string }) {
  return (
    <DropdownMenuTrigger asChild>
      <span
        role="button"
        tabIndex={0}
        aria-label={label}
        title={label}
        className={actionClass}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <MoreHorizontal className="size-4" />
      </span>
    </DropdownMenuTrigger>
  );
}

/**
 * Per-row hover actions. Shown inline: new file / new folder (directories
 * only). Everything else (reveal, rename, duplicate, delete) lives behind the
 * "..." overflow menu. Every action dispatches a command via {@link useCommands}.
 */
export function NodeActions({ node }: { node: FileNode }) {
  const { executeCommand } = useCommands();
  const isDir = node.type === "directory";
  return (
    <span className="flex items-center gap-0.5">
      {isDir && (
        <>
          <IconAction
            label={`New from Examples in ${node.name}`}
            onClick={() =>
              executeCommand({
                type: "openStartFromExample",
                args: { parent: node.path },
              })
            }
          >
            <FilePlus className="size-4" />
          </IconAction>
          <IconAction
            label={`New folder in ${node.name}`}
            onClick={() =>
              executeCommand({
                type: "newFolder",
                args: { parent: node.path },
              })
            }
          >
            <FolderPlus className="size-4" />
          </IconAction>
        </>
      )}
      <DropdownMenu>
        <MoreActionsTrigger label={`More actions for ${node.name}`} />
        <DropdownMenuContent
          align="end"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <DropdownMenuItem
            onSelect={() =>
              executeCommand({ type: "revealFile", args: { path: node.path } })
            }
          >
            <FolderOpen />
            {REVEAL_LABEL}
          </DropdownMenuItem>
          {isDir && (
            <DropdownMenuItem
              onSelect={() =>
                executeCommand({
                  type: "importFiles",
                  args: { parent: node.path },
                })
              }
            >
              <Import />
              Import from Files...
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() =>
              executeCommand({
                type: "duplicateFile",
                args: { path: node.path },
              })
            }
          >
            <Copy />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              executeCommand({ type: "renameFile", args: { path: node.path } })
            }
          >
            <TextCursorInput />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() =>
              executeCommand({ type: "deleteFile", args: { path: node.path } })
            }
          >
            <Trash2 />
            {MOVE_TO_TRASH_LABEL}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

/**
 * New file / new folder actions for the (row-less) storage root, with reveal
 * and refresh behind the "..." overflow menu. Every action dispatches a command
 * via {@link useCommands}.
 */
export function RootActions() {
  const { executeCommand } = useCommands();
  return (
    <span className="flex items-center gap-1">
      <IconAction
        label="New from Examples"
        onClick={() =>
          executeCommand({
            type: "openStartFromExample",
            args: { parent: "" },
          })
        }
      >
        <FilePlus className="size-4" />
      </IconAction>
      <IconAction
        label="New folder in workspace root"
        onClick={() =>
          executeCommand({ type: "newFolder", args: { parent: "" } })
        }
      >
        <FolderPlus className="size-4" />
      </IconAction>
      <IconAction
        label="Settings"
        onClick={() => executeCommand({ type: "openSettings", args: {} })}
      >
        <SettingsIcon className="size-4" />
      </IconAction>
      <DropdownMenu>
        <MoreActionsTrigger label="More actions for workspace root" />
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() =>
              executeCommand({ type: "revealFile", args: { path: "" } })
            }
          >
            <FolderOpen />
            {REVEAL_LABEL}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              executeCommand({ type: "importFiles", args: { parent: "" } })
            }
          >
            <Import />
            Import from Files...
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => executeCommand({ type: "refreshTree", args: {} })}
          >
            <RefreshCw />
            Refresh
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
