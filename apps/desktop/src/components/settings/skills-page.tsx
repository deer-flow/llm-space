"use client";

import type { SkillInfo, SkillsSettings } from "@llm-space/core";
import { ConfirmDialog } from "@llm-space/ui/components/confirm-dialog";
import { SkillListItem } from "@llm-space/ui/components/skill-list-item";
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
import { ScrollArea } from "@llm-space/ui/ui/scroll-area";
import {
  Ban,
  CheckCheck,
  Folder,
  FolderOpen,
  Loader2,
  MoreHorizontal,
  Plus,
  Puzzle,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { fsReveal } from "@/client/built-in-tools";
import {
  addSkillsPath,
  browseForSkillsPath,
  getSkillsSettings,
  listPluginSkills,
  listSkills,
  removeSkillsPath,
  setAllSkillsHidden,
  setAllPluginSkillsHidden,
  setPluginSkillHidden,
  setSkillHidden,
} from "@/client/skills";
import { electrobun } from "@/lib/electrobun";
import type { RuntimeId } from "@/shared/runtime";

import { SettingsPage } from "./settings-page";

const _isWindows =
  typeof navigator !== "undefined" && /Win/i.test(navigator.userAgent);

/**
 * The OS file manager's name, for the "Reveal in …" menu label. Windows calls
 * it Explorer; macOS (and our Linux fallback) say Finder.
 */
const REVEAL_LABEL = _isWindows ? "Reveal in Explorer" : "Reveal in Finder";

/** Reveal a discovery folder in the OS file manager, toasting if it's gone. */
async function revealDiscoveryPath(path: string) {
  try {
    await fsReveal(path);
  } catch (error) {
    toast.error("Failed to reveal folder", {
      description: error instanceof Error ? error.message : "Please try again.",
    });
  }
}

/** Open a skill directory in the OS file manager. */
async function openSkillFolder(skill: SkillInfo) {
  try {
    await fsReveal(skill.path);
  } catch (error) {
    toast.error("Failed to open skill folder", {
      description: error instanceof Error ? error.message : "Please try again.",
    });
  }
}

export function SkillsPage({ runtimeId }: { runtimeId: RuntimeId }) {
  const [settings, setSettings] = useState<SkillsSettings>({
    discoveryPaths: [],
  });
  const [pluginSkills, setPluginSkills] = useState<SkillInfo[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  // Bumped after a bulk enable/disable so the skills pane refetches.
  const [reloadToken, setReloadToken] = useState(0);

  const loadSources = useCallback(() => {
    let cancelled = false;
    void Promise.all([
      getSkillsSettings(runtimeId),
      listPluginSkills(runtimeId),
    ])
      .then(([loadedSettings, availableSkills]) => {
        if (!cancelled) {
          setSettings(loadedSettings);
          setPluginSkills(
            availableSkills.filter(
              (skill) => skill.source === "plugin" && skill.pluginId
            )
          );
        }
      })
      .catch(() => {
        // A load failure is non-fatal; leave the existing sources in place.
      });
    return () => {
      cancelled = true;
    };
  }, [runtimeId]);

  useEffect(() => loadSources(), [loadSources]);

  useEffect(() => {
    if (runtimeId !== "local") return;
    const rpc = electrobun.rpc;
    rpc?.addMessageListener("pluginsChanged", loadSources);
    return () => rpc?.removeMessageListener("pluginsChanged", loadSources);
  }, [loadSources, runtimeId]);

  const paths = settings.discoveryPaths;
  const pluginGroups = useMemo(() => {
    const groups = new Map<string, SkillInfo[]>();
    for (const skill of pluginSkills) {
      if (!skill.pluginId) continue;
      const group = groups.get(skill.pluginId) ?? [];
      group.push(skill);
      groups.set(skill.pluginId, group);
    }
    return [...groups.entries()]
      .map(([pluginId, skills]) => ({ pluginId, skills }))
      .sort((a, b) => a.pluginId.localeCompare(b.pluginId));
  }, [pluginSkills]);
  const sourceIds = useMemo(
    () => [
      ...paths.map((entry) => `folder:${entry.path}`),
      ...pluginGroups.map((group) => `plugin:${group.pluginId}`),
    ],
    [paths, pluginGroups]
  );

  // Keep a valid selection as folders are added/removed or plugins change.
  useEffect(() => {
    if (!selectedSourceId || !sourceIds.includes(selectedSourceId)) {
      setSelectedSourceId(sourceIds[0] ?? null);
    }
  }, [selectedSourceId, sourceIds]);

  const selectedPath = selectedSourceId?.startsWith("folder:")
    ? selectedSourceId.slice("folder:".length)
    : null;
  const selectedPlugin = selectedSourceId?.startsWith("plugin:")
    ? (pluginGroups.find(
        (group) => group.pluginId === selectedSourceId.slice("plugin:".length)
      ) ?? null)
    : null;

  const handleAdd = useCallback(async () => {
    try {
      const path = await browseForSkillsPath();
      if (!path) {
        return;
      }
      const next = await addSkillsPath(path, runtimeId);
      setSettings(next);
      setSelectedSourceId(`folder:${path}`);
    } catch (error) {
      toast.error("Failed to add folder", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    }
  }, [runtimeId]);

  const handleRemove = useCallback(
    async (path: string) => {
      try {
        setSettings(await removeSkillsPath(path, runtimeId));
      } catch (error) {
        toast.error("Failed to remove folder", {
          description:
            error instanceof Error ? error.message : "Please try again.",
        });
      }
    },
    [runtimeId]
  );

  const handleSetAll = useCallback(
    async (path: string, hidden: boolean) => {
      try {
        setSettings(await setAllSkillsHidden(path, hidden, runtimeId));
        // Refetch the skills pane so its switches reflect the bulk change.
        setReloadToken((token) => token + 1);
      } catch (error) {
        toast.error(
          hidden ? "Failed to disable skills" : "Failed to enable skills",
          {
            description:
              error instanceof Error ? error.message : "Please try again.",
          }
        );
      }
    },
    [runtimeId]
  );

  const handleSetAllPlugin = useCallback(
    async (pluginId: string, hidden: boolean) => {
      try {
        await setAllPluginSkillsHidden(pluginId, hidden, runtimeId);
        setPluginSkills((current) =>
          current.map((skill) =>
            skill.pluginId === pluginId ? { ...skill, enabled: !hidden } : skill
          )
        );
      } catch (error) {
        toast.error(
          hidden ? "Failed to disable skills" : "Failed to enable skills",
          {
            description:
              error instanceof Error ? error.message : "Please try again.",
          }
        );
      }
    },
    [runtimeId]
  );

  return (
    <SettingsPage
      className="flex size-full min-h-0"
      title="Skills"
      description={
        <>
          These settings only apply to the built-in <code>skill()</code> tool.
        </>
      }
    >
      <PathList
        paths={paths}
        pluginGroups={pluginGroups}
        selectedSourceId={selectedSourceId}
        onSelect={setSelectedSourceId}
        onAdd={() => void handleAdd()}
        onRemove={(path) => void handleRemove(path)}
        onEnableAll={(path) => void handleSetAll(path, false)}
        onDisableAll={(path) => void handleSetAll(path, true)}
        onEnableAllPlugin={(pluginId) =>
          void handleSetAllPlugin(pluginId, false)
        }
        onDisableAllPlugin={(pluginId) =>
          void handleSetAllPlugin(pluginId, true)
        }
      />
      <PathSkills
        key={`${runtimeId}:${selectedSourceId}:${reloadToken}`}
        path={selectedPath}
        plugin={selectedPlugin}
        runtimeId={runtimeId}
      />
    </SettingsPage>
  );
}

function PathList({
  paths,
  pluginGroups,
  selectedSourceId,
  onSelect,
  onAdd,
  onRemove,
  onEnableAll,
  onDisableAll,
  onEnableAllPlugin,
  onDisableAllPlugin,
}: {
  paths: SkillsSettings["discoveryPaths"];
  pluginGroups: { pluginId: string; skills: SkillInfo[] }[];
  selectedSourceId: string | null;
  onSelect: (sourceId: string) => void;
  onAdd: () => void;
  onRemove: (path: string) => void;
  onEnableAll: (path: string) => void;
  onDisableAll: (path: string) => void;
  onEnableAllPlugin: (pluginId: string) => void;
  onDisableAllPlugin: (pluginId: string) => void;
}) {
  const [listRef] = useAutoAnimation<HTMLDivElement>();

  return (
    <div className="flex w-64 shrink-0 flex-col gap-3 border-r pr-4">
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        FOLDERS
      </span>

      <ScrollArea className="min-h-0 grow">
        {paths.length === 0 && pluginGroups.length === 0 ? (
          <div className="text-muted-foreground px-2 py-6 text-center text-xs text-balance">
            No folders yet. Click the &quot;Add folder&quot; button below to get
            started.
          </div>
        ) : (
          <div ref={listRef} className="flex flex-col gap-1 pr-2">
            {paths.map((entry) => (
              <PathListItem
                key={entry.path}
                path={entry.path}
                selected={`folder:${entry.path}` === selectedSourceId}
                onSelect={() => onSelect(`folder:${entry.path}`)}
                onRemove={() => onRemove(entry.path)}
                onEnableAll={() => onEnableAll(entry.path)}
                onDisableAll={() => onDisableAll(entry.path)}
              />
            ))}
            {pluginGroups.map((group) => (
              <PluginSourceListItem
                key={group.pluginId}
                pluginId={group.pluginId}
                skillCount={group.skills.length}
                sourcePath={_parentPath(group.skills[0]?.path)}
                selected={`plugin:${group.pluginId}` === selectedSourceId}
                onSelect={() => onSelect(`plugin:${group.pluginId}`)}
                onEnableAll={() => onEnableAllPlugin(group.pluginId)}
                onDisableAll={() => onDisableAllPlugin(group.pluginId)}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      <Button variant="outline" className="w-full" onClick={onAdd}>
        <Plus />
        Add folder
      </Button>
    </div>
  );
}

function PluginSourceListItem({
  pluginId,
  skillCount,
  sourcePath,
  selected,
  onSelect,
  onEnableAll,
  onDisableAll,
}: {
  pluginId: string;
  skillCount: number;
  sourcePath: string | null;
  selected: boolean;
  onSelect: () => void;
  onEnableAll: () => void;
  onDisableAll: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Select skills from plugin ${pluginId}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors",
        selected ? "bg-muted font-medium" : "hover:bg-muted/50"
      )}
    >
      <Puzzle className="text-muted-foreground size-4 shrink-0" />
      <span className="min-w-0 grow">
        <span className="block truncate" title={pluginId}>
          Plugin · {pluginId}
        </span>
        <span className="text-muted-foreground block truncate text-[11px] font-normal">
          {skillCount} {skillCount === 1 ? "skill" : "skills"}
        </span>
      </span>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <span
            role="button"
            tabIndex={0}
            aria-label={`${pluginId} plugin skill actions`}
            title={`${pluginId} plugin skill actions`}
            className={cn(
              "text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-5 shrink-0 items-center justify-center rounded",
              menuOpen
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onClick={(event) => event.stopPropagation()}
        >
          {sourcePath && (
            <>
              <DropdownMenuItem
                onSelect={() => void revealDiscoveryPath(sourcePath)}
              >
                <FolderOpen />
                {REVEAL_LABEL}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={onEnableAll}>
            <CheckCheck />
            Enable all skills
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDisableAll}>
            <Ban />
            Disable all skills
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function _parentPath(inputPath: string | undefined): string | null {
  if (!inputPath) return null;
  const separator = Math.max(
    inputPath.lastIndexOf("/"),
    inputPath.lastIndexOf("\\")
  );
  return separator > 0 ? inputPath.slice(0, separator) : null;
}

function PathListItem({
  path,
  selected,
  onSelect,
  onRemove,
  onEnableAll,
  onDisableAll,
}: {
  path: string;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onEnableAll: () => void;
  onDisableAll: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Select ${path}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors",
        selected ? "bg-muted font-medium" : "hover:bg-muted/50"
      )}
    >
      <Folder className="text-muted-foreground size-4 shrink-0" />
      <span className="line-clamp-1 grow break-all" title={path}>
        {path}
      </span>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <span
            role="button"
            tabIndex={0}
            aria-label={`${path} folder actions`}
            title={`${path} folder actions`}
            className={cn(
              "text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-5 shrink-0 items-center justify-center rounded",
              menuOpen
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => void revealDiscoveryPath(path)}>
            <FolderOpen />
            {REVEAL_LABEL}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onEnableAll()}>
            <CheckCheck />
            Enable all skills
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onDisableAll()}>
            <Ban />
            Disable all skills
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setConfirmOpen(true)}
          >
            <Trash2 />
            Remove {path}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remove folder?"
        description={`This removes "${path}" from your skill discovery folders. You can add it back later.`}
        confirmLabel="Remove"
        dimBackground={false}
        onConfirm={() => {
          setConfirmOpen(false);
          onRemove();
        }}
      />
    </div>
  );
}

function PathSkills({
  path,
  plugin,
  runtimeId,
}: {
  path: string | null;
  plugin: { pluginId: string; skills: SkillInfo[] } | null;
  runtimeId: RuntimeId;
}) {
  const [skills, setSkills] = useState<SkillInfo[] | null>(null);
  const [listRef] = useAutoAnimation<HTMLDivElement>();

  useEffect(() => {
    if (plugin) {
      setSkills(plugin.skills);
      return;
    }
    if (!path) {
      setSkills([]);
      return;
    }
    let cancelled = false;
    setSkills(null);
    void listSkills(path, runtimeId)
      .then((loaded) => {
        if (!cancelled) {
          setSkills(loaded);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSkills([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, plugin, runtimeId]);

  const handleToggle = useCallback(
    async (name: string, enabled: boolean) => {
      if (!path && !plugin) {
        return;
      }
      // Optimistically reflect the toggle.
      setSkills((prev) =>
        prev ? prev.map((s) => (s.name === name ? { ...s, enabled } : s)) : prev
      );
      try {
        if (plugin) {
          await setPluginSkillHidden(
            plugin.pluginId,
            name,
            !enabled,
            runtimeId
          );
        } else if (path) {
          await setSkillHidden(path, name, !enabled, runtimeId);
        }
      } catch (error) {
        // Roll back on failure.
        setSkills((prev) =>
          prev
            ? prev.map((s) =>
                s.name === name ? { ...s, enabled: !enabled } : s
              )
            : prev
        );
        toast.error("Failed to update skill", {
          description:
            error instanceof Error ? error.message : "Please try again.",
        });
      }
    },
    [path, plugin, runtimeId]
  );

  const content = useMemo(() => {
    if (!path && !plugin) {
      return (
        <div className="text-muted-foreground flex size-full items-center justify-center text-sm">
          Select or add a source from the left sidebar
        </div>
      );
    }
    if (skills === null) {
      return (
        <div className="text-muted-foreground flex items-center gap-2 px-1 py-6 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading skills…
        </div>
      );
    }
    if (skills.length === 0) {
      return (
        <div className="text-muted-foreground px-1 py-6 text-sm">
          No skills found in this source.
        </div>
      );
    }
    return (
      <div ref={listRef} className="flex flex-col gap-1.5">
        {skills.map((skill) => (
          <SkillListItem
            key={skill.name}
            name={skill.name}
            description={skill.description}
            checked={skill.enabled}
            onTitleClick={() => void openSkillFolder(skill)}
            onCheckedChange={(enabled) =>
              void handleToggle(skill.name, enabled)
            }
          />
        ))}
      </div>
    );
  }, [handleToggle, listRef, path, plugin, skills]);

  return (
    <div className="flex min-w-0 grow flex-col">
      <ScrollArea className="min-h-0 grow">
        <div className="flex flex-col gap-2 pr-4 pl-6">
          {plugin && (
            <div className="text-muted-foreground pb-1 text-xs">
              Managed by the{" "}
              <span className="text-foreground">{plugin.pluginId}</span> plugin.
            </div>
          )}
          {content}
        </div>
      </ScrollArea>
    </div>
  );
}
