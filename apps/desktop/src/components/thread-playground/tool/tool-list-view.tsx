"use client";

import { type FunctionTool } from "@llm-space/core";
import { CableIcon, FunctionSquareIcon, PlusIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import {
  useThreadStore,
  useThreadStoreActions,
} from "@/components/thread-playground/stores/thread-store";
import { useAutoAnimation } from "@/lib/use-auto-animation";
import { cn } from "@/lib/utils";

import { Button } from "../../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";

import { McpToolImportDialog } from "./mcp-tool-import-popover";
import { ToolEditorDialog } from "./tool-editor-dialog";
import { ToolListItem } from "./tool-list-item";

export function ToolListView({
  className,
  readonly,
}: {
  className?: string;
  readonly?: boolean;
}) {
  const tools = useThreadStore((s) => s.thread.context?.tools);
  const { addTool, removeTool } = useThreadStoreActions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<FunctionTool | null>(null);
  const existingToolNames = useMemo(
    () => new Set((tools ?? []).map((tool) => tool.name)),
    [tools]
  );

  const [animationContainerRef] = useAutoAnimation({ duration: 150 });

  const openAddDialog = useCallback(() => {
    setEditingTool(null);
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((tool: FunctionTool) => {
    setEditingTool(tool);
    setDialogOpen(true);
  }, []);

  const handleRemoveTool = useCallback(
    (tool: FunctionTool) => {
      removeTool(tool.name);
    },
    [removeTool]
  );

  return (
    <>
      <div
        ref={animationContainerRef}
        className={cn("group flex min-w-0 grow flex-wrap gap-2.5", className)}
      >
        {tools?.map((t) => (
          <ToolListItem
            key={t.name}
            tool={t}
            readonly={readonly}
            onEdit={openEditDialog}
            onRemove={handleRemoveTool}
          />
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className={cn(
                "-ml-1 px-0 transition-opacity hover:bg-transparent!",
                readonly ? "opacity-30!" : "opacity-50"
              )}
              variant="ghost"
              size="sm"
              disabled={readonly}
            >
              <PlusIcon className="size-3" />
              Add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={openAddDialog}>
              <FunctionSquareIcon />
              Function tool
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setMcpOpen(true)}>
              <CableIcon />
              Add MCP tools
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <McpToolImportDialog
          open={mcpOpen}
          onOpenChange={setMcpOpen}
          existingToolNames={existingToolNames}
          onAdd={addTool}
          onRemove={removeTool}
        />
      </div>
      <ToolEditorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tool={editingTool}
      />
    </>
  );
}
