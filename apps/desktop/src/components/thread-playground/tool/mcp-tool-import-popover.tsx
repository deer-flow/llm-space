"use client";

import { type FunctionTool } from "@llm-space/core";
import { Cable, Loader2, RefreshCw } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { format } from "timeago.js";

import { listMcpServers, listMcpTools } from "@/client/mcp";
import { useCommands } from "@/commands";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  getMcpReadinessLabel,
  type McpServerView,
  type McpToolSummary,
} from "@/shared/mcp";

function _McpToolImportDialog({
  existingToolNames,
  onAdd,
  onRemove,
  open,
  onOpenChange,
}: {
  existingToolNames: Set<string>;
  onAdd: (tool: FunctionTool) => boolean;
  onRemove: (toolName: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { executeCommand } = useCommands();
  const [servers, setServers] = useState<McpServerView[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>("");
  const [tools, setTools] = useState<McpToolSummary[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);
  const [loadingTools, setLoadingTools] = useState(false);

  const selectedServer = useMemo(
    () => servers.find((server) => server.id === selectedServerId) ?? null,
    [selectedServerId, servers]
  );
  const diagnostic = selectedServer?.readiness?.diagnostic;
  const diagnosticHeadline = diagnostic?.headline;
  const errorText = diagnosticHeadline ?? selectedServer?.lastError;
  const isErrorText =
    Boolean(selectedServer?.lastError) || diagnostic?.outcome === "failed";

  const refreshServers = useCallback(async () => {
    setLoadingServers(true);
    try {
      const next = await listMcpServers();
      setServers(next);
      setSelectedServerId((current) =>
        current && next.some((server) => server.id === current)
          ? current
          : (next[0]?.id ?? "")
      );
    } catch (error) {
      toast.error("Failed to load MCP servers", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setLoadingServers(false);
    }
  }, []);

  const refreshTools = useCallback(
    async (serverId: string) => {
      if (!serverId) {
        setTools([]);
        return;
      }
      setLoadingTools(true);
      try {
        const response = await listMcpTools(serverId);
        setTools(response.tools);
        setServers((current) =>
          current.map((server) =>
            server.id === response.server.id ? response.server : server
          )
        );
      } catch (error) {
        setTools([]);
        await refreshServers();
        toast.error("Failed to load MCP tools", {
          description:
            error instanceof Error ? error.message : "Please try again.",
        });
      } finally {
        setLoadingTools(false);
      }
    },
    [refreshServers]
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    void refreshServers();
  }, [open, refreshServers]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTools(selectedServer?.readiness?.tools ?? []);
  }, [open, selectedServer]);

  const handleToggleTool = (tool: McpToolSummary, checked: boolean) => {
    if (!checked) {
      onRemove(tool.directName);
      return;
    }
    if (!selectedServer) {
      return;
    }
    onAdd({
      name: tool.directName,
      description: tool.description,
      parameters: tool.inputSchema,
      source: {
        type: "mcp",
        serverId: selectedServer.id,
        serverName: selectedServer.serverName,
        toolName: tool.toolName,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-4rem)] w-[min(720px,calc(100vw-2rem))] max-w-none! flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>Add MCP tools</DialogTitle>
          <DialogDescription>
            Choose a server, then add one or more MCP tools to this thread.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden p-4">
          <div className="flex items-center gap-2">
            <Select
              value={selectedServerId}
              onValueChange={setSelectedServerId}
              disabled={servers.length === 0}
            >
              <SelectTrigger className="min-w-0 flex-1" aria-label="MCP server">
                <SelectValue placeholder="Select MCP server" />
              </SelectTrigger>
              <SelectContent>
                {servers.map((server) => (
                  <SelectItem key={server.id} value={server.id}>
                    {server.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tooltip content="Refresh MCP tools">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Refresh MCP tools"
                disabled={!selectedServerId || loadingTools}
                onClick={() => void refreshTools(selectedServerId)}
              >
                {loadingTools || loadingServers ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
              </Button>
            </Tooltip>
          </div>

          {selectedServer ? (
            <div className="bg-muted/40 flex min-w-0 items-center justify-between gap-2 rounded-md px-2 py-1.5">
              <div className="min-w-0">
                <div className="text-xs font-medium">
                  {_serverReadinessLabel(selectedServer)}
                </div>
                {errorText ? (
                  <div
                    className={cn(
                      "truncate text-xs",
                      isErrorText ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {errorText}
                  </div>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0"
                onClick={() => {
                  onOpenChange(false);
                  executeCommand({
                    type: "openSettings",
                    args: { tab: "mcp" },
                  });
                }}
              >
                Open settings
              </Button>
            </div>
          ) : null}

          <div className="min-h-0 overflow-y-auto">
            {servers.length === 0 ? (
              <div className="text-muted-foreground px-1 py-6 text-center text-sm">
                No MCP servers.
              </div>
            ) : tools.length === 0 && !loadingTools ? (
              <div className="text-muted-foreground px-1 py-6 text-center text-sm">
                No tools loaded. Refresh to test this server.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {tools.map((tool) => {
                  const exists = existingToolNames.has(tool.directName);
                  const disabledReason = tool.disabledReason;
                  return (
                    <div
                      key={tool.toolName}
                      className={cn(
                        "hover:bg-accent flex min-w-0 items-start gap-3 rounded-md px-2 py-2 text-left transition-colors",
                        !tool.available && "opacity-50"
                      )}
                    >
                      <Cable className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                      <span className="min-w-0 grow">
                        <span className="block truncate font-mono text-xs">
                          {tool.directName}
                        </span>
                        {tool.description ? (
                          <span className="text-muted-foreground line-clamp-2 text-xs">
                            {tool.description}
                          </span>
                        ) : null}
                        {disabledReason ? (
                          <span className="text-destructive block text-xs">
                            {disabledReason}
                          </span>
                        ) : null}
                      </span>
                      <Switch
                        className="mt-0.5"
                        size="sm"
                        checked={exists}
                        disabled={!tool.available}
                        aria-label={`${exists ? "Remove" : "Add"} ${tool.directName}`}
                        onCheckedChange={(checked) =>
                          handleToggleTool(tool, checked)
                        }
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {diagnosticHeadline ? (
            <div className="text-muted-foreground text-xs">
              Open settings for the full redacted diagnostic timeline.
            </div>
          ) : selectedServer?.lastError ? (
            <div className="text-destructive text-xs">
              {selectedServer.lastError}
            </div>
          ) : null}
        </div>
        <DialogFooter className="border-t px-4 py-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const McpToolImportDialog = memo(_McpToolImportDialog);

function _serverReadinessLabel(server: McpServerView): string {
  const readiness = server.readiness;
  const label = getMcpReadinessLabel(readiness);
  const parts = [label];
  if (readiness?.toolCount !== null && readiness?.toolCount !== undefined) {
    parts.push(
      `${readiness.toolCount} tool${readiness.toolCount === 1 ? "" : "s"}`
    );
  }
  if (readiness?.testedAt) {
    parts.push(`tested ${format(readiness.testedAt)}`);
  }
  return parts.join(" · ");
}
