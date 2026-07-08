"use client";

import { type BuiltinTool } from "@llm-space/core";
import {
  CloudSunIcon,
  FilesIcon,
  GlobeIcon,
  type LucideIcon,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { listBuiltInTools } from "@/client/built-in-tools";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { getBuiltInToolIcon } from "./built-in-tool-icon";

type BuiltInToolCategoryId = "fileSystem" | "web" | "misc";

interface BuiltInToolCategory {
  id: BuiltInToolCategoryId;
  label: string;
  icon: LucideIcon;
}

const BUILT_IN_TOOL_CATEGORIES: BuiltInToolCategory[] = [
  { id: "fileSystem", label: "File system", icon: FilesIcon },
  { id: "web", label: "Web", icon: GlobeIcon },
  { id: "misc", label: "Misc", icon: CloudSunIcon },
];

const FILE_SYSTEM_TOOL_NAMES = new Set([
  "read",
  "write",
  "edit",
  "ls",
  "tree",
  "grep",
  "glob",
  "bash",
  "skill",
  "present_files",
]);

const WEB_TOOL_NAMES = new Set(["web_fetch", "web_search"]);

function _BuiltInToolImportDialog({
  existingToolNames,
  initialToolName,
  onAdd,
  onRemove,
  open,
  onOpenChange,
}: {
  existingToolNames: Set<string>;
  initialToolName?: string | null;
  onAdd: (tool: BuiltinTool) => boolean;
  onRemove: (toolName: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tools, setTools] = useState<BuiltinTool[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] =
    useState<BuiltInToolCategoryId>("fileSystem");
  const [highlightedToolName, setHighlightedToolName] = useState<string | null>(
    null
  );
  const toolRowRefs = useRef(new Map<string, HTMLDivElement>());

  const loadTools = useCallback(async () => {
    try {
      setTools(await listBuiltInTools());
    } catch (error) {
      toast.error("Failed to load built-in tools", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (initialToolName) {
      setSelectedCategoryId(_categoryForTool(initialToolName));
    }
    void loadTools();
  }, [initialToolName, open, loadTools]);

  useEffect(() => {
    if (!open || !initialToolName) {
      return;
    }
    if (!tools.some((tool) => tool.name === initialToolName)) {
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

  const handleToggleTool = (tool: BuiltinTool, checked: boolean) => {
    if (!checked) {
      onRemove(tool.name);
      return;
    }
    onAdd(tool);
  };
  const toolsByCategory = useMemo(() => {
    const result = new Map<BuiltInToolCategoryId, BuiltinTool[]>(
      BUILT_IN_TOOL_CATEGORIES.map((category) => [category.id, []])
    );
    for (const tool of tools) {
      result.get(_categoryForTool(tool.name))!.push(tool);
    }
    return result;
  }, [tools]);
  const selectedTools = toolsByCategory.get(selectedCategoryId) ?? [];
  const selectedCategory = BUILT_IN_TOOL_CATEGORIES.find(
    (category) => category.id === selectedCategoryId
  )!;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[600px] max-h-[calc(100vh-4rem)] w-[min(800px,calc(100vw-2rem))] max-w-none! flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>Add built-in tools</DialogTitle>
          <DialogDescription>
            Choose built-in tools to make available in this thread.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="flex w-44 shrink-0 flex-col gap-1 border-r p-3">
            {BUILT_IN_TOOL_CATEGORIES.map((category) => {
              const CategoryIcon = category.icon;
              const count = toolsByCategory.get(category.id)?.length ?? 0;
              const selected = category.id === selectedCategoryId;
              return (
                <button
                  key={category.id}
                  type="button"
                  className={cn(
                    "focus-visible:ring-ring/30 flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-xs outline-none transition-colors focus-visible:ring-2",
                    selected
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground"
                  )}
                  onClick={() => setSelectedCategoryId(category.id)}
                >
                  <CategoryIcon className="size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {category.label}
                  </span>
                  <span className="text-muted-foreground font-mono text-[0.625rem]">
                    {count}
                  </span>
                </button>
              );
            })}
          </aside>
          <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-muted-foreground text-xs">
                {selectedCategory.label} · {selectedTools.length} tool
                {selectedTools.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
              {selectedTools.length === 0 ? (
                <div className="text-muted-foreground px-3 py-6 text-center text-sm">
                  No built-in tools in this category.
                </div>
              ) : (
                selectedTools.map((tool) => {
                  const exists = existingToolNames.has(tool.name);
                  const ToolIcon = getBuiltInToolIcon(tool);
                  const highlighted = highlightedToolName === tool.name;
                  return (
                    <div
                      key={tool.name}
                      ref={(element) => {
                        if (element) {
                          toolRowRefs.current.set(tool.name, element);
                        } else {
                          toolRowRefs.current.delete(tool.name);
                        }
                      }}
                      className={cn(
                        "flex min-w-0 items-center gap-3 border-b px-3 py-2 transition-colors duration-500 last:border-b-0",
                        highlighted && "bg-primary/10 text-primary"
                      )}
                    >
                      <ToolIcon
                        className={cn(
                          "size-4 shrink-0",
                          highlighted ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-sm">
                          {tool.name}
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
                      </div>
                      <Switch
                        checked={exists}
                        aria-label={`${exists ? "Remove" : "Add"} ${tool.name}`}
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

export const BuiltInToolImportDialog = memo(_BuiltInToolImportDialog);

function _categoryForTool(toolName: string): BuiltInToolCategoryId {
  if (FILE_SYSTEM_TOOL_NAMES.has(toolName)) {
    return "fileSystem";
  }
  if (WEB_TOOL_NAMES.has(toolName)) {
    return "web";
  }
  return "misc";
}
