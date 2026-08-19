"use client";

import { getToolKey, type PluginTool } from "@llm-space/core";
import { PackageCheckIcon, SearchIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useHostServices } from "@llm-space/ui/host";
import { cn } from "@llm-space/ui/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";
import { Input } from "@llm-space/ui/ui/input";
import { Switch } from "@llm-space/ui/ui/switch";

import { sortToolsByName } from "./sort-tools-by-name";
import { ToolImportSidebarActions } from "./tool-import-sidebar-actions";

export function PluginToolImportDialog({
  existingToolNames,
  initialToolId,
  onAdd,
  onRemove,
  runtimeId,
  open,
  onOpenChange,
}: {
  existingToolNames: Set<string>;
  initialToolId?: string | null;
  onAdd: (tool: PluginTool) => boolean;
  onRemove: (tool: PluginTool) => void;
  runtimeId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { pluginTools } = useHostServices();
  const [tools, setTools] = useState<PluginTool[]>([]);
  const [query, setQuery] = useState("");
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);

  const loadTools = useCallback(async () => {
    try {
      const next = await pluginTools.list({ runtimeId });
      setTools(next);
      setSelectedPluginId((current) =>
        current && next.some((tool) => tool.pluginId === current)
          ? current
          : (next[0]?.pluginId ?? null)
      );
    } catch (error) {
      toast.error("Failed to load Plugin Tools", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    }
  }, [pluginTools, runtimeId]);

  useEffect(() => {
    if (open) void loadTools();
  }, [loadTools, open]);

  useEffect(() => {
    if (!open || !initialToolId) return;
    const tool = tools.find((candidate) => candidate.toolId === initialToolId);
    if (tool) setSelectedPluginId(tool.pluginId);
  }, [initialToolId, open, tools]);

  const filteredTools = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return tools;
    return tools.filter(
      (tool) =>
        tool.name.toLocaleLowerCase().includes(normalized) ||
        tool.description.toLocaleLowerCase().includes(normalized) ||
        tool.pluginId.toLocaleLowerCase().includes(normalized)
    );
  }, [query, tools]);
  const pluginIds = useMemo(
    () => [...new Set(filteredTools.map((tool) => tool.pluginId))],
    [filteredTools]
  );
  const selectedTools = sortToolsByName(
    filteredTools.filter((tool) => tool.pluginId === selectedPluginId)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[600px] max-h-[calc(100vh-4rem)] w-[min(800px,calc(100vw-2rem))] max-w-none! flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>Add Plugin Tools</DialogTitle>
          <DialogDescription>
            Choose tools from locally installed Plugins for this thread.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="flex w-52 shrink-0 flex-col gap-2 border-r p-3">
            <div className="relative">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tools"
                aria-label="Search Plugin Tools"
                className="h-8 pl-7 text-xs"
              />
            </div>
            <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
              {pluginIds.map((pluginId) => {
                const pluginEntries = filteredTools.filter(
                  (tool) => tool.pluginId === pluginId
                );
                return (
                  <div
                    key={pluginId}
                    className={cn(
                      "group/row relative flex min-h-8 items-center gap-2 rounded-md px-2 text-xs transition-colors",
                      selectedPluginId === pluginId
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground"
                    )}
                  >
                    <button
                      type="button"
                      aria-label={pluginId}
                      className="focus-visible:ring-ring/30 absolute inset-0 rounded-md outline-none focus-visible:ring-2"
                      onClick={() => setSelectedPluginId(pluginId)}
                    />
                    <PackageCheckIcon className="size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{pluginId}</span>
                    <ToolImportSidebarActions
                      count={pluginEntries.length}
                      onEnableAll={() => {
                        for (const tool of pluginEntries) {
                          if (!existingToolNames.has(tool.name)) onAdd(tool);
                        }
                      }}
                      onDisableAll={() => {
                        for (const tool of pluginEntries) {
                          if (existingToolNames.has(tool.name)) onRemove(tool);
                        }
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </aside>
          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            {runtimeId && runtimeId !== "local" ? (
              <div className="text-muted-foreground py-8 text-center text-sm">
                Plugin Tools are available only in the local runtime.
              </div>
            ) : selectedTools.length === 0 ? (
              <div className="text-muted-foreground py-8 text-center text-sm">
                {query.trim()
                  ? "No Plugin Tools match your search."
                  : "No Plugin Tools are available."}
              </div>
            ) : (
              selectedTools.map((tool) => {
                const enabled = existingToolNames.has(tool.name);
                return (
                  <div
                    key={getToolKey(tool)}
                    className="flex items-start gap-3 border-b py-3 last:border-b-0"
                  >
                    <PackageCheckIcon className="text-muted-foreground mt-0.5 size-4" />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-sm">{tool.name}</div>
                      <div className="text-muted-foreground mt-1 text-xs">
                        {tool.description}
                      </div>
                    </div>
                    <Switch
                      checked={enabled}
                      aria-label={`${enabled ? "Remove" : "Add"} ${tool.name}`}
                      onCheckedChange={(checked) =>
                        checked ? onAdd(tool) : onRemove(tool)
                      }
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
