"use client";

import {
  getToolKey,
  isProviderHostedTool,
  type FunctionTool,
  type PluginTool,
  type ProviderHostedTool,
  type Tool,
} from "@llm-space/core";
import {
  CableIcon,
  CloudIcon,
  FunctionSquareIcon,
  PackageCheckIcon,
  PlusIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { useHostServices } from "@llm-space/ui/host";
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
import { PluginToolImportDialog } from "./plugin-tool-import-dialog";
import { ProviderHostedToolEditorDialog } from "./provider-hosted-tool-editor-dialog";
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
  const runtimeId = useThreadStore((s) => s.runtimeId);
  const { addTool, removeTool } = useThreadStoreActions();
  const { presentational } = useHostServices();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [providerHostedDialogOpen, setProviderHostedDialogOpen] =
    useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [builtInOpen, setBuiltInOpen] = useState(false);
  const [pluginOpen, setPluginOpen] = useState(false);
  const [initialMcpServerId, setInitialMcpServerId] = useState<string | null>(
    null
  );
  const [initialMcpToolName, setInitialMcpToolName] = useState<string | null>(
    null
  );
  const [initialBuiltInToolName, setInitialBuiltInToolName] = useState<
    string | null
  >(null);
  const [initialPluginToolId, setInitialPluginToolId] = useState<string | null>(
    null
  );
  const [editingTool, setEditingTool] = useState<FunctionTool | null>(null);
  const [editingProviderHostedTool, setEditingProviderHostedTool] =
    useState<ProviderHostedTool | null>(null);
  const existingToolNames = useMemo(
    () =>
      new Set(
        (tools ?? [])
          .filter((tool) => !isProviderHostedTool(tool))
          .map((tool) => tool.name)
      ),
    [tools]
  );

  const [animationContainerRef] = useAutoAnimation({ duration: 150 });

  const openAddDialog = useCallback(() => {
    setEditingTool(null);
    setDialogOpen(true);
  }, []);

  const openAddProviderHostedDialog = useCallback(() => {
    setEditingProviderHostedTool(null);
    setProviderHostedDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((tool: Tool) => {
    if (tool.type === "provider-hosted") {
      setEditingProviderHostedTool(tool);
      setProviderHostedDialogOpen(true);
      return;
    }
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
    if (tool.type === "plugin") {
      setInitialPluginToolId(tool.toolId);
      setPluginOpen(true);
      return;
    }
    setEditingTool(tool);
    setDialogOpen(true);
  }, []);

  const handleRemoveTool = useCallback(
    (tool: Tool) => {
      removeTool(getToolKey(tool));
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
            key={getToolKey(t)}
            tool={t}
            readonly={readonly}
            onEdit={openEditDialog}
            onRemove={handleRemoveTool}
          />
        ))}
        {!presentational && (
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
                  setInitialPluginToolId(null);
                  setPluginOpen(true);
                }}
              >
                <PackageCheckIcon />
                Add Plugin Tools
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
              <DropdownMenuItem onSelect={openAddProviderHostedDialog}>
                <CloudIcon />
                Add Provider-Hosted Tool
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={openAddDialog}>
                <FunctionSquareIcon />
                Add Custom Function Tool
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
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
          runtimeId={runtimeId}
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
          runtimeId={runtimeId}
          onAdd={addTool}
          onRemove={removeTool}
        />
        <PluginToolImportDialog
          open={pluginOpen}
          onOpenChange={(open) => {
            setPluginOpen(open);
            if (!open) setInitialPluginToolId(null);
          }}
          initialToolId={initialPluginToolId}
          existingToolNames={existingToolNames}
          runtimeId={runtimeId}
          onAdd={(tool: PluginTool) => addTool(tool)}
          onRemove={(tool) => removeTool(getToolKey(tool))}
        />
      </div>
      <ToolEditorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tool={editingTool}
      />
      <ProviderHostedToolEditorDialog
        open={providerHostedDialogOpen}
        onOpenChange={(open) => {
          setProviderHostedDialogOpen(open);
          if (!open) {
            setEditingProviderHostedTool(null);
          }
        }}
        tool={editingProviderHostedTool}
      />
    </>
  );
}
