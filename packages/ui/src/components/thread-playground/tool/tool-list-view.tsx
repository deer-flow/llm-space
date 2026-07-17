"use client";

import { type FunctionTool, type Tool } from "@llm-space/core";
import {
  CableIcon,
  FunctionSquareIcon,
  PackageCheckIcon,
  PlusIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { useAutoAnimation } from "@llm-space/ui/lib/use-auto-animation";
import { cn } from "@llm-space/ui/lib/utils";
import { Button } from "@llm-space/ui/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@llm-space/ui/ui/dropdown-menu";

import {
  useThreadStore,
  useThreadStoreActions,
} from "../stores/thread-store";

import { BuiltInToolImportDialog } from "./built-in-tool-import-dialog";
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
  const [builtInOpen, setBuiltInOpen] = useState(false);
  const [initialMcpServerId, setInitialMcpServerId] = useState<string | null>(
    null
  );
  const [initialMcpToolName, setInitialMcpToolName] = useState<string | null>(
    null
  );
  const [initialBuiltInToolName, setInitialBuiltInToolName] = useState<
    string | null
  >(null);
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

  const openEditDialog = useCallback((tool: Tool) => {
    if (tool.type === "mcp") {
      setInitialMcpServerId(tool.serverId);
      setInitialMcpToolName(tool.name);
      setMcpOpen(true);
      return;
    }
    if (tool.type === "builtin") {
      setInitialBuiltInToolName(tool.name);
      setBuiltInOpen(true);
      return;
    }
    setEditingTool(tool);
    setDialogOpen(true);
  }, []);

  const handleRemoveTool = useCallback(
    (tool: Tool) => {
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
            <DropdownMenuItem
              onSelect={() => {
                setInitialBuiltInToolName(null);
                setBuiltInOpen(true);
              }}
            >
              <PackageCheckIcon />
              Add Built-in Tools
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setInitialMcpServerId(null);
                setInitialMcpToolName(null);
                setMcpOpen(true);
              }}
            >
              <CableIcon />
              Add MCP Tools
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={openAddDialog}>
              <FunctionSquareIcon />
              Add Custom Function Tool
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <McpToolImportDialog
          open={mcpOpen}
          onOpenChange={(open) => {
            setMcpOpen(open);
            if (!open) {
              setInitialMcpServerId(null);
              setInitialMcpToolName(null);
            }
          }}
          initialServerId={initialMcpServerId}
          initialToolName={initialMcpToolName}
          existingToolNames={existingToolNames}
          onAdd={addTool}
          onRemove={removeTool}
        />
        <BuiltInToolImportDialog
          open={builtInOpen}
          onOpenChange={(open) => {
            setBuiltInOpen(open);
            if (!open) {
              setInitialBuiltInToolName(null);
            }
          }}
          initialToolName={initialBuiltInToolName}
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
