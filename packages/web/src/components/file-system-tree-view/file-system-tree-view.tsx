"use client";

import type { FileNode } from "@llm-space/core";
import { MessagesSquare } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  TreeView,
  type TreeDataItem,
  type TreeRenderItemParams,
} from "@/components/tree-view";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { NodeActions, RootActions } from "./node-actions";
import {
  basename,
  ensureJson,
  parentOf,
  useFileSystemTree,
} from "./use-file-system-tree";

export function FileSystemTreeView({ className }: { className?: string }) {
  const {
    nodesByPath,
    loadingByPath,
    isRootLoading,
    expanded,
    toggle,
    expand,
    refresh,
    createFolder,
    createFile,
    remove,
    move,
    rename,
  } = useFileSystemTree();

  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  // Root actions appear only while the pointer is within the tree list (and
  // stay visible until it leaves the whole panel, so they remain clickable).
  const [showRootActions, setShowRootActions] = useState(false);
  // Path of a just-created node we want to expand-to, scroll to, and rename
  // once its parent's listing has loaded.
  const [pendingReveal, setPendingReveal] = useState<string | null>(null);

  async function create(parent: string, kind: "file" | "folder") {
    const path =
      kind === "file" ? await createFile(parent) : await createFolder(parent);
    if (!path) return;
    if (parent !== "") expand(parent);
    setPendingReveal(path);
  }

  // When the new node's parent listing contains it, reveal + rename it.
  useEffect(() => {
    if (!pendingReveal) return;
    const siblings = nodesByPath.get(parentOf(pendingReveal));
    if (!siblings?.some((n) => n.path === pendingReveal)) return;
    setRenaming(pendingReveal);
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-tree-id="${CSS.escape(pendingReveal)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
    setPendingReveal(null);
  }, [pendingReveal, nodesByPath]);

  const data = useMemo<TreeDataItem[]>(() => {
    const toItem = (node: FileNode): TreeDataItem => {
      const actions = (
        <NodeActions
          node={node}
          onNewFile={(n) => void create(n.path, "file")}
          onNewFolder={(n) => void create(n.path, "folder")}
          onRename={(n) => startRename(n)}
          onDelete={(n) => setDeleting(n.path)}
        />
      );
      if (node.type === "directory") {
        const open = expanded.has(node.path);
        // Empty array stays truthy so the directory still renders an expand
        // chevron while its listing loads.
        const children =
          open && nodesByPath.has(node.path) ? build(node.path) : [];
        return {
          id: node.path,
          name: node.name,
          draggable: true,
          droppable: true,
          onClick: () => toggle(node.path),
          // While renaming, render as a leaf (a div) instead of an accordion
          // trigger (a button) so the input's keys (Space/Enter) don't toggle
          // the node. A renamed folder is always collapsed first (see
          // startRename), so there is nothing hidden by dropping its children.
          children: renaming === node.path ? undefined : children,
          actions,
          loading: open && loadingByPath.has(node.path),
        };
      }
      return {
        id: node.path,
        name: node.name.replace(/\.json$/, ""),
        icon: MessagesSquare,
        draggable: true,
        droppable: false,
        actions,
      };
    };

    // Only directories and *.json files are shown in the tree.
    const build = (dirPath: string): TreeDataItem[] =>
      (nodesByPath.get(dirPath) ?? [])
        .filter(
          (node) => node.type === "directory" || node.name.endsWith(".json")
        )
        .map(toItem);

    return build("");
  }, [
    nodesByPath,
    loadingByPath,
    expanded,
    toggle,
    remove,
    renaming,
    createFile,
    createFolder,
  ]);

  function startRename(node: FileNode) {
    // Collapse a folder before renaming so it remounts consistently afterwards
    // (the row is rendered as a leaf while editing).
    if (node.type === "directory" && expanded.has(node.path)) toggle(node.path);
    setRenaming(node.path);
  }

  function onDocumentDrag(source: TreeDataItem, target: TreeDataItem) {
    // Only directories and the root drop-zone are droppable, so the target is
    // always a directory ("" = root).
    void move(source.id, target.id);
  }

  function renderItem(p: TreeRenderItemParams) {
    const isRenaming = renaming === p.item.id;
    // Files carry an icon; folders don't (chevron only). Keyed off the item, not
    // `isLeaf`, since a folder is rendered as a leaf while being renamed.
    const Icon = p.item.icon;
    return (
      <>
        {Icon && <Icon className="mr-2 h-4 w-4 shrink-0 text-[#64a4f2]" />}
        {isRenaming ? (
          <RenameInput
            initial={p.item.name}
            onCancel={() => setRenaming(null)}
            onConfirm={(value) => {
              const base = value.trim();
              setRenaming(null);
              if (base && base !== p.item.name) {
                // `Icon` is only set on files, so it distinguishes file vs
                // folder even while the row is rendered as a leaf for renaming.
                void rename(p.item.id, Icon ? ensureJson(base) : base);
              }
            }}
          />
        ) : (
          <span className="min-w-0 grow truncate text-left text-sm">
            {p.item.name}
          </span>
        )}
        {!isRenaming && (
          <div className="ml-1 hidden shrink-0 group-hover:flex">
            {p.item.actions}
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className={cn("flex h-full flex-col", className)}
      onMouseLeave={() => setShowRootActions(false)}
    >
      <div className="text-muted-foreground flex items-center justify-between px-3 py-1.5 text-xs font-medium">
        <span>Workspace</span>
        <span
          className={cn(
            "transition-opacity",
            showRootActions ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        >
          <RootActions
            onNewFile={() => void create("", "file")}
            onNewFolder={() => void create("", "folder")}
            onRefresh={refresh}
          />
        </span>
      </div>

      <div
        className="min-h-0 flex-1 overflow-auto"
        onMouseEnter={() => setShowRootActions(true)}
      >
        {isRootLoading ? (
          <div className="flex items-center justify-center p-4">
            <Spinner />
          </div>
        ) : (
          <TreeView
            data={data}
            expandedIds={[...expanded]}
            renderItem={renderItem}
            onDocumentDrag={onDocumentDrag}
          />
        )}
      </div>

      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete &ldquo;
              {deleting ? basename(deleting).replace(/\.json$/, "") : ""}
              &rdquo;?
            </DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const path = deleting;
                setDeleting(null);
                if (path) void remove(path);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** In-place rename input: Enter confirms, Esc / blur cancels. */
function RenameInput({
  initial,
  onConfirm,
  onCancel,
}: {
  initial: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      autoFocus
      value={value}
      className="ring-border bg-background text-foreground focus-visible:ring-ring/50 box-border h-5 w-full min-w-0 grow rounded px-1 text-sm leading-none outline-none ring-1 ring-inset focus-visible:ring-2"
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={onCancel}
      onKeyDown={(e) => {
        // Stop the accordion trigger (this input lives inside its button) from
        // reacting to keys like Space/Enter that would toggle the node.
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          onConfirm(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    />
  );
}
