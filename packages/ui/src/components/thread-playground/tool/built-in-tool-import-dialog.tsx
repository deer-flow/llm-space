"use client";

import {
  getArkImageModelDefinitions,
  SEEDREAM_IMAGE_SIZES,
  type BuiltinTool,
  type GenerateImageToolConfig,
  type SeedreamImageModelDefinition,
  type SeedreamImageSize,
} from "@llm-space/core";
import {
  CloudSunIcon,
  FilesIcon,
  GlobeIcon,
  ImageIcon,
  SearchIcon,
  type LucideIcon,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useModels } from "@llm-space/ui/components/model-provider";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@llm-space/ui/ui/select";
import { Switch } from "@llm-space/ui/ui/switch";

import { getBuiltInToolIcon } from "./built-in-tool-icon";
import { ToolImportSidebarActions } from "./tool-import-sidebar-actions";

type BuiltInToolCategoryId = "fileSystem" | "web" | "media" | "misc";

interface BuiltInToolCategory {
  id: BuiltInToolCategoryId;
  label: string;
  icon: LucideIcon;
}

const BUILT_IN_TOOL_CATEGORIES: BuiltInToolCategory[] = [
  { id: "fileSystem", label: "File system", icon: FilesIcon },
  { id: "web", label: "Web", icon: GlobeIcon },
  { id: "media", label: "Media", icon: ImageIcon },
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

const WEB_TOOL_NAMES = new Set(["web_fetch", "web_search", "weather_report"]);

const MEDIA_TOOL_NAMES = new Set(["generate_image"]);

function _BuiltInToolImportDialog({
  existingToolNames,
  existingTools,
  initialToolName,
  onAdd,
  onUpdate,
  onRemove,
  runtimeId,
  open,
  onOpenChange,
}: {
  existingToolNames: Set<string>;
  existingTools: Map<string, BuiltinTool>;
  initialToolName?: string | null;
  onAdd: (tool: BuiltinTool) => boolean;
  onUpdate: (name: string, tool: BuiltinTool) => boolean;
  onRemove: (toolName: string) => void;
  runtimeId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tools, setTools] = useState<BuiltinTool[]>([]);
  const [query, setQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] =
    useState<BuiltInToolCategoryId>("fileSystem");
  const [highlightedToolName, setHighlightedToolName] = useState<string | null>(
    null
  );
  const [generateImageConfig, setGenerateImageConfig] =
    useState<GenerateImageToolConfig | null>(null);
  const toolRowRefs = useRef(new Map<string, HTMLDivElement>());
  const { builtinTools } = useHostServices();
  const providers = useModels();
  const enabledImageModels = useMemo(() => {
    const config = providers.find(
      (provider) => provider.id === "ark"
    )?.imageGeneration;
    if (!config) {
      return [];
    }
    const disabled = new Set(config.disabledModels ?? []);
    return getArkImageModelDefinitions(config).filter(
      (model) => !disabled.has(model.id)
    );
  }, [providers]);

  const loadTools = useCallback(async () => {
    try {
      setTools(await builtinTools.list({ runtimeId }));
    } catch (error) {
      toast.error("Failed to load built-in tools", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    }
  }, [builtinTools, runtimeId]);

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

  useEffect(() => {
    if (!open) {
      return;
    }
    const existing = existingTools.get("generate_image");
    if (existing) {
      setGenerateImageConfig(_readGenerateImageConfig(existing.config));
      return;
    }
    const first = enabledImageModels[0];
    setGenerateImageConfig(
      first
        ? {
            model: first.id,
            size: first.defaultSize,
            watermark: true,
          }
        : null
    );
  }, [enabledImageModels, existingTools, open]);

  /** Persist config immediately for an existing tool or keep it as an add draft. */
  const handleGenerateImageConfigChange = (config: GenerateImageToolConfig) => {
    setGenerateImageConfig(config);
    const existing = existingTools.get("generate_image");
    if (existing) {
      onUpdate(existing.name, { ...existing, config: { ...config } });
    }
  };

  const handleToggleTool = (tool: BuiltinTool, checked: boolean) => {
    if (!checked) {
      onRemove(tool.name);
      return;
    }
    if (tool.name !== "generate_image") {
      onAdd(tool);
      return;
    }
    const model = enabledImageModels.find(
      (candidate) => candidate.id === generateImageConfig?.model
    );
    if (!model || !generateImageConfig) {
      toast.error("Choose an enabled image model", {
        description:
          "Enable an Ark image model in Settings, then select it here.",
      });
      return;
    }
    onAdd({ ...tool, config: { ...generateImageConfig } });
  };
  const filteredTools = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return tools;
    }
    return tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(q) ||
        (tool.description?.toLowerCase().includes(q) ?? false)
    );
  }, [tools, query]);
  const toolsByCategory = useMemo(() => {
    const result = new Map<BuiltInToolCategoryId, BuiltinTool[]>(
      BUILT_IN_TOOL_CATEGORIES.map((category) => [category.id, []])
    );
    for (const tool of filteredTools) {
      result.get(_categoryForTool(tool.name))!.push(tool);
    }
    return result;
  }, [filteredTools]);
  const selectedTools = toolsByCategory.get(selectedCategoryId) ?? [];

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
          <DialogTitle>Add built-in tools</DialogTitle>
          <DialogDescription>
            Choose built-in tools to make available in this thread.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="flex w-44 shrink-0 flex-col gap-2 border-r p-3">
            <div className="relative">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tools"
                aria-label="Search tools"
                className="h-8 pl-7 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              {BUILT_IN_TOOL_CATEGORIES.map((category) => {
                const CategoryIcon = category.icon;
                const categoryTools = toolsByCategory.get(category.id) ?? [];
                const selected = category.id === selectedCategoryId;
                return (
                  <div
                    key={category.id}
                    className={cn(
                      "group/row relative flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-xs transition-colors",
                      selected
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground"
                    )}
                  >
                    <button
                      type="button"
                      aria-label={category.label}
                      className="focus-visible:ring-ring/30 absolute inset-0 rounded-md outline-none focus-visible:ring-2"
                      onClick={() => setSelectedCategoryId(category.id)}
                    />
                    <CategoryIcon className="size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {category.label}
                    </span>
                    <ToolImportSidebarActions
                      count={categoryTools.length}
                      onEnableAll={() => {
                        for (const tool of categoryTools) {
                          if (!existingToolNames.has(tool.name)) {
                            handleToggleTool(tool, true);
                          }
                        }
                      }}
                      onDisableAll={() => {
                        for (const tool of categoryTools) {
                          if (existingToolNames.has(tool.name)) {
                            onRemove(tool.name);
                          }
                        }
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden pl-4">
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {selectedTools.length === 0 ? (
                <div className="text-muted-foreground px-3 py-6 text-center text-sm">
                  {query.trim()
                    ? "No tools match your search."
                    : "No built-in tools in this category."}
                </div>
              ) : (
                selectedTools.map((tool) => {
                  const exists = existingToolNames.has(tool.name);
                  const ToolIcon = getBuiltInToolIcon(tool);
                  const highlighted = highlightedToolName === tool.name;
                  const configuredImageModel = enabledImageModels.find(
                    (model) => model.id === generateImageConfig?.model
                  );
                  const canAdd =
                    tool.name !== "generate_image" ||
                    Boolean(configuredImageModel && generateImageConfig);
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
                        "flex min-w-0 items-start gap-3 border-b px-3 py-3 transition-colors duration-500 last:border-b-0",
                        highlighted && "bg-primary/10 text-primary"
                      )}
                    >
                      <ToolIcon
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
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
                        {tool.name === "generate_image" && (
                          <GenerateImageConfigFields
                            config={generateImageConfig}
                            enabledModels={enabledImageModels}
                            selectedModel={configuredImageModel}
                            onChange={handleGenerateImageConfigChange}
                          />
                        )}
                      </div>
                      <Switch
                        className="mt-0.5"
                        checked={exists}
                        disabled={!exists && !canAdd}
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

/** Configure the user-owned defaults persisted with one generate_image tool. */
function GenerateImageConfigFields({
  config,
  enabledModels,
  selectedModel,
  onChange,
}: {
  config: GenerateImageToolConfig | null;
  enabledModels: readonly SeedreamImageModelDefinition[];
  selectedModel?: SeedreamImageModelDefinition;
  onChange: (config: GenerateImageToolConfig) => void;
}) {
  const handleModelChange = (modelId: string) => {
    const model = enabledModels.find((candidate) => candidate.id === modelId);
    if (!model) {
      return;
    }
    onChange({
      model: model.id,
      size:
        config && model.supportedSizes.includes(config.size)
          ? config.size
          : model.defaultSize,
      watermark: config?.watermark ?? true,
    });
  };

  return (
    <div className="mt-3 grid grid-cols-[minmax(0,1fr)_7rem_auto] gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-muted-foreground text-xs">Model</span>
        <Select
          value={selectedModel?.id}
          disabled={enabledModels.length === 0}
          onValueChange={handleModelChange}
        >
          <SelectTrigger
            className="h-8 w-full"
            aria-label="Generate image model"
          >
            <SelectValue placeholder="Choose model" />
          </SelectTrigger>
          <SelectContent>
            {enabledModels.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">Default size</span>
        <Select
          value={selectedModel ? config?.size : undefined}
          disabled={!selectedModel}
          onValueChange={(size) => {
            if (config) {
              onChange({ ...config, size: size as SeedreamImageSize });
            }
          }}
        >
          <SelectTrigger className="h-8 w-full" aria-label="Default image size">
            <SelectValue placeholder="Size" />
          </SelectTrigger>
          <SelectContent>
            {selectedModel?.supportedSizes.map((size) => (
              <SelectItem key={size} value={size}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">Watermark</span>
        <div className="flex h-8 items-center justify-between gap-2 rounded-md border px-2">
          <span className="text-xs">
            {config?.watermark === false ? "Disabled" : "Enabled"}
          </span>
          <Switch
            size="sm"
            checked={config?.watermark ?? true}
            disabled={!selectedModel || !config}
            aria-label="Add AI-generated watermark"
            onCheckedChange={(watermark) => {
              if (config) {
                onChange({ ...config, watermark });
              }
            }}
          />
        </div>
      </div>

      {enabledModels.length === 0 ? (
        <p className="text-destructive col-span-3 text-xs">
          Enable an Ark image model in Settings before adding this tool.
        </p>
      ) : !config || !selectedModel ? (
        <p className="text-destructive col-span-3 text-xs">
          Choose an enabled image model for this tool.
        </p>
      ) : null}
    </div>
  );
}

/** Parse persisted generate_image config without silently repairing stale ids. */
function _readGenerateImageConfig(
  value: Record<string, unknown> | undefined
): GenerateImageToolConfig | null {
  const model = value?.model;
  const size = value?.size;
  const watermark = value?.watermark;
  if (
    typeof model !== "string" ||
    !SEEDREAM_IMAGE_SIZES.some((candidate) => candidate === size) ||
    typeof watermark !== "boolean"
  ) {
    return null;
  }
  return { model, size: size as SeedreamImageSize, watermark };
}

function _categoryForTool(toolName: string): BuiltInToolCategoryId {
  if (FILE_SYSTEM_TOOL_NAMES.has(toolName)) {
    return "fileSystem";
  }
  if (WEB_TOOL_NAMES.has(toolName)) {
    return "web";
  }
  if (MEDIA_TOOL_NAMES.has(toolName)) {
    return "media";
  }
  return "misc";
}
