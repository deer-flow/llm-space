"use client";

import { type McpTool } from "@llm-space/core";
import { cn } from "@llm-space/ui/lib/utils";
import { Button } from "@llm-space/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";
import { Switch } from "@llm-space/ui/ui/switch";
import { Cable, Loader2, RefreshCw, Settings2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { format } from "timeago.js";

import { listMcpServers, listMcpTools } from "@/client/mcp";
import { useCommands } from "@/commands";
import {
  getMcpReadinessLabel,
  type McpServerView,
  type McpToolSummary,
} from "@/shared/mcp";

import { ToolImportSidebarActions } from "./tool-import-sidebar-actions";

function _McpToolImportDialog({
  existingToolNames,
  initialServerId,
  initialToolName,
  onAdd,
  onRemove,
  open,
  onOpenChange,
}: {
  existingToolNames: Set<string>;
  initialServerId?: string | null;
  initialToolName?: string | null;
  onAdd: (tool: McpTool) => boolean;
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
  const [highlightedToolName, setHighlightedToolName] = useState<string | null>(
    null
  );
  const toolRowRefs = useRef(new Map<string, HTMLDivElement>());

  const selectedServer = useMemo(
    () => servers.find((server) => server.id === selectedServerId) ?? null,
    [selectedServerId, servers]
  );
  const diagnostic = selectedServer?.readiness?.diagnostic;
  const errorText = diagnostic?.headline ?? selectedServer?.lastError;
  const isErrorText =
    Boolean(selectedServer?.lastError) || diagnostic?.outcome === "failed";

  const refreshServers = useCallback(async () => {
    setLoadingServers(true);
    try {
      const next = await listMcpServers();
      setServers(next);
      setSelectedServerId((current) =>
        initialServerId && next.some((server) => server.id === initialServerId)
          ? initialServerId
          : current && next.some((server) => server.id === current)
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
  }, [initialServerId]);

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
    if (!open || !initialServerId) {
      return;
    }
    setSelectedServerId((current) =>
      servers.some((server) => server.id === initialServerId)
        ? initialServerId
        : current
    );
  }, [initialServerId, open, servers]);

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

  useEffect(() => {
    if (!open || !initialToolName) {
      return;
    }
    if (!tools.some((tool) => tool.directName === initialToolName)) {
      return;
    }
    setHighlightedToolName(initialToolName);
    requestAnimationFrame(() => {
      toolRowRefs.current.get(initialToolName)?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    });
    const timeout = window.setTimeout(() => {
      setHighlightedToolName((current) =>
        current === initialToolName ? null : current
      );
    }, 2000);
    return () => window.clearTimeout(timeout);
  }, [initialToolName, open, tools]);

  const handleToggleTool = (tool: McpToolSummary, checked: boolean) => {
    if (!checked) {
      onRemove(tool.directName);
      return;
    }
    if (!selectedServer) {
      return;
    }
    onAdd({
      type: "mcp",
      name: tool.directName,
      description: tool.description,
      parameters: tool.inputSchema,
      serverId: selectedServer.id,
      serverName: selectedServer.serverName,
      toolName: tool.toolName,
    });
  };

  const openMcpSettings = () => {
    onOpenChange(false);
    executeCommand({ type: "openSettings", args: { tab: "mcp" } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[600px] max-h-[calc(100vh-4rem)] w-[min(800px,calc(100vw-2rem))] max-w-none! flex-col gap-0 overflow-hidden p-0"
        onInteractOutside={(event) => {
          if (
            document.querySelector(
              '[data-slot="dropdown-menu-content"][data-state="open"]'
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>Add MCP tools</DialogTitle>
          <DialogDescription>
            Choose a server, then add one or more MCP tools to this thread.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="flex w-44 shrink-0 flex-col border-r p-3">
            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              {servers.length === 0 ? (
                <div className="text-muted-foreground px-2 py-6 text-center text-xs">
                  {loadingServers ? "Loading…" : "No servers"}
                </div>
              ) : (
                servers.map((server) => {
                  const count = server.toolCount ?? server.readiness?.toolCount;
                  const selected = server.id === selectedServerId;
                  const serverTools =
                    server.id === selectedServerId
                      ? tools
                      : (server.readiness?.tools ?? []);
                  return (
                    <div
                      key={server.id}
                      className={cn(
                        "group/row relative flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-xs transition-colors",
                        selected
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground"
                      )}
                    >
                      <button
                        type="button"
                        aria-label={server.name}
                        className="focus-visible:ring-ring/30 absolute inset-0 rounded-md outline-none focus-visible:ring-2"
                        onClick={() => setSelectedServerId(server.id)}
                      />
                      <Cable className="size-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">
                        {server.name}
                      </span>
                      <ToolImportSidebarActions
                        count={count}
                        onEnableAll={() => {
                          for (const tool of serverTools) {
                            if (
                              tool.available &&
                              !existingToolNames.has(tool.directName)
                            ) {
                              onAdd({
                                type: "mcp",
                                name: tool.directName,
                                description: tool.description,
                                parameters: tool.inputSchema,
                                serverId: server.id,
                                serverName: server.serverName,
                                toolName: tool.toolName,
                              });
                            }
                          }
                        }}
                        onDisableAll={() => {
                          for (const tool of serverTools) {
                            if (existingToolNames.has(tool.directName)) {
                              onRemove(tool.directName);
                            }
                          }
                        }}
                      />
                    </div>
                  );
                })
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground mt-2 w-full"
              onClick={openMcpSettings}
            >
              <Settings2 className="size-3.5" />
              Configure MCP
            </Button>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden pl-4">
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {servers.length === 0 ? (
                <div className="text-muted-foreground flex flex-col items-center gap-3 px-3 py-8 text-center text-sm">
                  <span>No MCP servers configured.</span>
                  <Button size="sm" variant="outline" onClick={openMcpSettings}>
                    Open settings
                  </Button>
                </div>
              ) : tools.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-3 py-8 text-center text-sm">
                  <span
                    className={cn(
                      isErrorText ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {errorText ??
                      `${_serverReadinessLabel(selectedServer)} · no tools loaded`}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={loadingTools}
                      onClick={() => void refreshTools(selectedServerId)}
                    >
                      {loadingTools ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="size-4" />
                      )}
                      Test server
                    </Button>
                    <Button size="sm" variant="ghost" onClick={openMcpSettings}>
                      Open settings
                    </Button>
                  </div>
                </div>
              ) : (
                tools.map((tool) => {
                  const exists = existingToolNames.has(tool.directName);
                  const highlighted = highlightedToolName === tool.directName;
                  return (
                    <div
                      key={tool.toolName}
                      ref={(element) => {
                        if (element) {
                          toolRowRefs.current.set(tool.directName, element);
                        } else {
                          toolRowRefs.current.delete(tool.directName);
                        }
                      }}
                      className={cn(
                        "flex min-w-0 items-center gap-3 border-b px-3 py-2 transition-colors duration-500 last:border-b-0",
                        highlighted && "bg-primary/10 text-primary",
                        !tool.available && "opacity-50"
                      )}
                    >
                      <Cable
                        className={cn(
                          "size-4 shrink-0",
                          highlighted ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-sm">
                          {tool.directName}
                        </div>
                        {tool.description ? (
                          <div
                            className={cn(
                              "line-clamp-2 text-xs",
                              highlighted
                                ? "text-primary/80"
                                : "text-muted-foreground"
                            )}
                          >
                            {tool.description}
                          </div>
                        ) : null}
                        {tool.disabledReason ? (
                          <div className="text-destructive text-xs">
                            {tool.disabledReason}
                          </div>
                        ) : null}
                      </div>
                      <Switch
                        checked={exists}
                        disabled={!tool.available}
                        aria-label={`${exists ? "Remove" : "Add"} ${tool.directName}`}
                        onCheckedChange={(checked) =>
                          handleToggleTool(tool, checked)
                        }
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const McpToolImportDialog = memo(_McpToolImportDialog);

function _serverReadinessLabel(server: McpServerView | null): string {
  if (!server) {
    return "Untested";
  }
  const readiness = server.readiness;
  const label = getMcpReadinessLabel(readiness);
  const parts = [label];
  if (readiness?.testedAt) {
    parts.push(`tested ${format(readiness.testedAt)}`);
  }
  return parts.join(" · ");
}
