"use client";

import type { FileNode } from "@llm-space/core";
import { formatString, useI18n } from "@llm-space/ui/lib/i18n";
import { cn } from "@llm-space/ui/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@llm-space/ui/ui/dropdown-menu";
import {
  ClipboardCopy,
  ClipboardPaste,
  FilePlus,
  FilesIcon,
  FolderOpen,
  FolderPlus,
  FoldersIcon,
  Import,
  MoreHorizontal,
  RefreshCw,
  SettingsIcon,
  TextCursorInput,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { createFileSystemClient } from "@/client";
import { useCommands } from "@/commands";
import type { RuntimeId } from "@/shared/runtime";

import { ShareThreadMenuItem } from "./share-thread-menu-item";

/**
 * Whether the OS is Windows. The file manager name differs (Explorer vs
 * Finder) and so does the trash's name (Recycle Bin vs Trash); both resolve
 * through the dictionary at render time.
 */
const _isWindows =
  typeof navigator !== "undefined" && /Win/i.test(navigator.userAgent);

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
export function NodeActions({
  node,
  runtimeId,
  menuOpen,
  onMenuOpenChange,
}: {
  node: FileNode;
  runtimeId: RuntimeId;
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
}) {
  const { executeCommand } = useCommands();
  const { t } = useI18n();
  const isDir = node.type === "directory";
  // Copy the file to the OS clipboard as a file reference. The bun-side command
  // takes an absolute path, so resolve the workspace-relative node path first.
  const copyToClipboard = async () => {
    try {
      const path = await createFileSystemClient(runtimeId).realpath(node.path);
      executeCommand({ type: "copyFile", args: { path } });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  return (
    <span className="flex items-center gap-0.5">
      {isDir && (
        <>
          <IconAction
            label={formatString(t.desktop.fileTree.newFromExamplesInNode, {
              node: node.name,
            })}
            onClick={() =>
              executeCommand({
                type: "openStartFromExample",
                args: { parent: node.path, runtimeId },
              })
            }
          >
            <FilePlus className="size-4" />
          </IconAction>
          <IconAction
            label={formatString(t.desktop.fileTree.newFolderInNode, {
              node: node.name,
            })}
            onClick={() =>
              executeCommand({
                type: "newFolder",
                args: { parent: node.path, runtimeId },
              })
            }
          >
            <FolderPlus className="size-4" />
          </IconAction>
        </>
      )}
      <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
        <MoreActionsTrigger
          label={formatString(t.desktop.fileTree.moreActionsForNode, {
            node: node.name,
          })}
        />
        <DropdownMenuContent
          align="end"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <DropdownMenuItem
            onSelect={() =>
              executeCommand({
                type: "revealFile",
                args: { path: node.path, runtimeId },
              })
            }
          >
            <FolderOpen />
            {_isWindows ? t.common.revealInExplorer : t.common.revealInFinder}
          </DropdownMenuItem>
          {!isDir && (
            <>
              <DropdownMenuSeparator />
              <ShareThreadMenuItem
                path={node.path}
                runtimeId={runtimeId}
                executeCommand={executeCommand}
              />
            </>
          )}
          {isDir && (
            <>
              <DropdownMenuItem
                onSelect={() =>
                  executeCommand({
                    type: "importFiles",
                    args: { parent: node.path, runtimeId },
                  })
                }
              >
                <Import />
                {t.desktop.fileTree.importFromFiles}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  executeCommand({
                    type: "importFromClipboard",
                    args: { parent: node.path, runtimeId },
                  })
                }
              >
                <ClipboardPaste />
                {t.commands.importFromClipboard}
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          {!isDir && (
            <DropdownMenuItem onSelect={() => void copyToClipboard()}>
              <ClipboardCopy />
              {t.commands.copyFile}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() =>
              executeCommand({
                type: "duplicateFile",
                args: { path: node.path, runtimeId },
              })
            }
          >
            {isDir ? <FoldersIcon /> : <FilesIcon />}
            {t.commands.duplicateFile}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              executeCommand({
                type: "renameFile",
                args: { path: node.path, runtimeId },
              })
            }
          >
            <TextCursorInput />
            {t.commands.renameFile}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() =>
              executeCommand({
                type: "deleteFile",
                args: { path: node.path, runtimeId },
              })
            }
          >
            <Trash2 />
            {_isWindows
              ? t.desktop.threadTabs.moveToRecycleBin
              : t.desktop.threadTabs.moveToTrash}
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
export function RootActions({
  runtimeId,
  menuOpen,
  onMenuOpenChange,
}: {
  runtimeId: RuntimeId;
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
}) {
  const { executeCommand } = useCommands();
  const { t } = useI18n();
  return (
    <span className="flex items-center gap-1">
      <IconAction
        label={t.desktop.fileTree.newFromExamples}
        onClick={() =>
          executeCommand({
            type: "openStartFromExample",
            args: { parent: "", runtimeId },
          })
        }
      >
        <FilePlus className="size-4" />
      </IconAction>
      <IconAction
        label={t.desktop.fileTree.newFolderInRoot}
        onClick={() =>
          executeCommand({ type: "newFolder", args: { parent: "", runtimeId } })
        }
      >
        <FolderPlus className="size-4" />
      </IconAction>
      <IconAction
        label={t.commands.openSettings}
        onClick={() => executeCommand({ type: "openSettings", args: {} })}
      >
        <SettingsIcon className="size-4" />
      </IconAction>
      <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
        <MoreActionsTrigger label={t.desktop.fileTree.moreActionsForRoot} />
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() =>
              executeCommand({
                type: "revealFile",
                args: { path: "", runtimeId },
              })
            }
          >
            <FolderOpen />
            {_isWindows ? t.common.revealInExplorer : t.common.revealInFinder}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              executeCommand({
                type: "importFiles",
                args: { parent: "", runtimeId },
              })
            }
          >
            <Import />
            {t.desktop.fileTree.importFromFiles}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              executeCommand({
                type: "importFromClipboard",
                args: { parent: "", runtimeId },
              })
            }
          >
            <ClipboardPaste />
            {t.commands.importFromClipboard}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() =>
              executeCommand({ type: "refreshTree", args: { runtimeId } })
            }
          >
            <RefreshCw />
            {t.commands.refreshTree}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
