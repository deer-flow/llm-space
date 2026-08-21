"use client";

import type {
  JsonObject,
  JsonValue,
  PluginExtensionKind,
  PluginView,
} from "@llm-space/core";
import { ConfirmDialog } from "@llm-space/ui/components/confirm-dialog";
import { Link } from "@llm-space/ui/components/link";
import { formatString, useI18n } from "@llm-space/ui/lib/i18n";
import { cn } from "@llm-space/ui/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@llm-space/ui/ui/accordion";
import { Button } from "@llm-space/ui/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@llm-space/ui/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@llm-space/ui/ui/empty";
import { Input } from "@llm-space/ui/ui/input";
import { ScrollArea } from "@llm-space/ui/ui/scroll-area";
import { Switch } from "@llm-space/ui/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@llm-space/ui/ui/tabs";
import {
  ArrowUpRightIcon,
  Blocks,
  Bot,
  BrainCircuit,
  Braces,
  Cable,
  Cloud,
  Code2,
  Command,
  Copy,
  Database,
  FileCode2,
  FolderOpen,
  Globe2,
  MessageSquare,
  MoreHorizontal,
  Package,
  Puzzle,
  RefreshCw,
  ScrollText,
  Search,
  Server,
  Settings2,
  Sparkles,
  Terminal,
  Trash2,
  Workflow,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ensureRootDir } from "@/client/paths";
import {
  listPlugins,
  refreshPlugins,
  reloadPlugin,
  setPluginEnabled,
  setPluginSettings,
  uninstallPlugin,
} from "@/client/plugins";
import { electrobun } from "@/lib/electrobun";

import { SettingsEmptyState } from "./settings-empty-state";
import { SettingsPage } from "./settings-page";

const PLUGIN_DOCUMENTATION_URL =
  "https://github.com/deer-flow/llm-space/blob/main/docs/plugins.md";

const _isWindows =
  typeof navigator !== "undefined" && /Win/i.test(navigator.userAgent);

const PLUGIN_WALL_ICONS: readonly LucideIcon[] = [
  Wrench,
  Sparkles,
  Bot,
  Server,
  Blocks,
  Database,
  BrainCircuit,
  Workflow,
  Terminal,
  Cloud,
  Puzzle,
  Code2,
  Search,
  MessageSquare,
  FileCode2,
  Braces,
  Globe2,
  Zap,
  Package,
  Cable,
  Command,
];

const EXTENSION_KIND_ICONS: Record<PluginExtensionKind, LucideIcon> = {
  skill: Sparkles,
  mcp: Cable,
  model: BrainCircuit,
  command: Command,
  tool: Wrench,
  threadStorage: Database,
  settings: Settings2,
};

const EXTENSION_KIND_ORDER: readonly PluginExtensionKind[] = [
  "skill",
  "mcp",
  "model",
  "command",
  "tool",
  "threadStorage",
  "settings",
];

export function PluginsPage({
  preferredPluginId,
}: {
  preferredPluginId?: string;
}) {
  const { t } = useI18n();
  const [plugins, setPlugins] = useState<PluginView[]>([]);
  const [pluginsPath, setPluginsPath] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void ensureRootDir("plugins").then(setPluginsPath).catch(_showError);
    const loadPlugins = () => {
      void listPlugins()
        .then(setPlugins)
        .catch(_showError)
        .finally(() => setLoading(false));
    };
    loadPlugins();
    const rpc = electrobun.rpc;
    rpc?.addMessageListener("pluginsChanged", loadPlugins);
    return () => rpc?.removeMessageListener("pluginsChanged", loadPlugins);
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      setPlugins(await refreshPlugins());
    } catch (error) {
      _showError(error);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  const firstPluginId = useMemo(
    () => _sortPlugins(plugins)[0]?.id ?? null,
    [plugins]
  );

  useEffect(() => {
    if (
      preferredPluginId &&
      plugins.some((plugin) => plugin.id === preferredPluginId)
    ) {
      if (selectedId !== preferredPluginId) setSelectedId(preferredPluginId);
      return;
    }
    if (!selectedId || !plugins.some((plugin) => plugin.id === selectedId)) {
      setSelectedId(firstPluginId);
    }
  }, [firstPluginId, plugins, preferredPluginId, selectedId]);

  const selected = plugins.find((plugin) => plugin.id === selectedId) ?? null;

  return (
    <SettingsPage
      title={t.settings.dialog.tabs.plugins}
      description={
        <span>
          {t.settings.plugins.descriptionPrefix}
          <button
            type="button"
            className="text-foreground underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!pluginsPath}
            onClick={() => pluginsPath && _reveal(pluginsPath)}
          >
            {t.settings.plugins.pluginsDirectory}
          </button>
          {t.settings.plugins.descriptionSuffix}
        </span>
      }
      className="flex size-full min-h-0"
    >
      {loading ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-muted-foreground text-sm">{t.common.loading}</p>
        </div>
      ) : null}
      {!loading && plugins.length === 0 ? (
        <SettingsEmptyState
          icon={Puzzle}
          wallIcons={PLUGIN_WALL_ICONS}
          label={t.settings.plugins.noPluginsInstalled}
          title={t.settings.plugins.emptyTitle}
          description={t.settings.plugins.emptyDescription}
          actions={
            <>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="outline"
                  className="bg-background/60 hover:bg-background/85 border-border/80 shadow-sm backdrop-blur-md"
                  disabled={!pluginsPath}
                  onClick={() => pluginsPath && _reveal(pluginsPath)}
                >
                  <FolderOpen />
                  {t.settings.plugins.openFolder}
                </Button>
                <Button disabled={refreshing} onClick={() => void refresh()}>
                  <RefreshCw
                    className={refreshing ? "animate-spin" : undefined}
                  />
                  {t.settings.plugins.refresh}
                </Button>
              </div>
              <Button
                variant="link"
                asChild
                className="text-muted-foreground"
                size="sm"
              >
                <Link href={PLUGIN_DOCUMENTATION_URL}>
                  {t.common.learnMore} <ArrowUpRightIcon />
                </Link>
              </Button>
            </>
          }
          capabilities={[
            {
              icon: Wrench,
              title: t.settings.plugins.capabilities.toolsAndSkills.title,
              description:
                t.settings.plugins.capabilities.toolsAndSkills.description,
            },
            {
              icon: Cable,
              title: t.settings.plugins.capabilities.modelsAndConnections.title,
              description:
                t.settings.plugins.capabilities.modelsAndConnections
                  .description,
            },
            {
              icon: Command,
              title: t.settings.plugins.capabilities.commandsAndStorage.title,
              description:
                t.settings.plugins.capabilities.commandsAndStorage.description,
            },
          ]}
        />
      ) : null}
      {!loading && plugins.length > 0 ? (
        <>
          <PluginList
            plugins={plugins}
            selectedId={selectedId}
            refreshing={refreshing}
            onSelect={setSelectedId}
            onChanged={setPlugins}
            onRefresh={() => void refresh()}
          />
          <PluginEditor
            key={selected?.id}
            plugin={selected}
            onChanged={setPlugins}
          />
        </>
      ) : null}
    </SettingsPage>
  );
}

function PluginList({
  plugins,
  selectedId,
  refreshing,
  onSelect,
  onChanged,
  onRefresh,
}: {
  plugins: PluginView[];
  selectedId: string | null;
  refreshing: boolean;
  onSelect: (id: string) => void;
  onChanged: (plugins: PluginView[]) => void;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return _sortPlugins(
      normalized
        ? plugins.filter(
            (plugin) =>
              plugin.displayName.toLowerCase().includes(normalized) ||
              plugin.id.toLowerCase().includes(normalized)
          )
        : plugins
    );
  }, [plugins, query]);

  return (
    <div className="flex w-64 shrink-0 flex-col gap-3 border-r pr-4">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
        <Input
          className="h-8 pl-7"
          aria-label={t.settings.plugins.search}
          placeholder={t.settings.plugins.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <ScrollArea className="min-h-0 grow">
        {filtered.length === 0 ? (
          <Empty className="min-h-48 gap-2 border-0 px-2 py-6">
            <EmptyHeader className="gap-1.5">
              <EmptyMedia variant="icon" className="text-muted-foreground">
                <Search />
              </EmptyMedia>
              <EmptyTitle>{t.settings.plugins.noMatching}</EmptyTitle>
              <EmptyDescription className="text-xs">
                {formatString(t.settings.plugins.noMatchFor, {
                  query: query.trim(),
                })}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-1 pr-2">
            {filtered.map((plugin) => (
              <PluginListItem
                key={`${plugin.id}:${plugin.path}`}
                plugin={plugin}
                selected={plugin.id === selectedId}
                onSelect={() => onSelect(plugin.id)}
                onChanged={onChanged}
              />
            ))}
          </div>
        )}
      </ScrollArea>
      <Button
        variant="outline"
        className="w-full"
        disabled={refreshing}
        onClick={onRefresh}
      >
        <RefreshCw className={refreshing ? "animate-spin" : undefined} />
        {t.settings.plugins.refresh}
      </Button>
    </div>
  );
}

function PluginListItem({
  plugin,
  selected,
  onSelect,
  onChanged,
}: {
  plugin: PluginView;
  selected: boolean;
  onSelect: () => void;
  onChanged: (plugins: PluginView[]) => void;
}) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);

  const handleReload = async () => {
    setReloading(true);
    try {
      onChanged(await reloadPlugin(plugin.id));
      toast.success(
        formatString(t.settings.plugins.reloaded, {
          name: plugin.displayName,
        })
      );
    } catch (error) {
      _showError(error);
    } finally {
      setReloading(false);
    }
  };

  const handleUninstall = async () => {
    setConfirmOpen(false);
    setUninstalling(true);
    try {
      onChanged(await uninstallPlugin(plugin.id));
      toast.success(
        formatString(t.settings.plugins.uninstalled, {
          name: plugin.displayName,
        })
      );
    } catch (error) {
      _showError(error);
    } finally {
      setUninstalling(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={formatString(t.settings.plugins.selectPlugin, {
        name: plugin.displayName,
      })}
      className={cn(
        "group flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors",
        selected ? "bg-muted font-medium" : "hover:bg-muted/50"
      )}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <PluginIcon plugin={plugin} className="size-6" />
      <span className="min-w-0 grow">
        <span className="block truncate">{plugin.displayName}</span>
        <span className="text-muted-foreground block truncate text-[10px] font-normal">
          {plugin.id}
        </span>
      </span>
      <span className="relative flex size-5 shrink-0 items-center justify-center">
        <span
          className={cn(
            "size-1.5 rounded-full transition-opacity group-focus-within:opacity-0 group-hover:opacity-0",
            plugin.status === "active"
              ? "bg-emerald-500"
              : plugin.status === "disabled"
                ? "bg-muted-foreground/40"
                : plugin.status === "degraded"
                  ? "bg-amber-500"
                  : "bg-destructive",
            menuOpen && "opacity-0"
          )}
          title={plugin.status}
        />
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <span
              role="button"
              tabIndex={0}
              aria-label={formatString(t.settings.plugins.pluginActions, {
                name: plugin.displayName,
              })}
              title={formatString(t.settings.plugins.pluginActions, {
                name: plugin.displayName,
              })}
              className={cn(
                "text-muted-foreground hover:bg-accent hover:text-foreground absolute inset-0 inline-flex items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
                menuOpen && "opacity-100"
              )}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(event) => event.stopPropagation()}
          >
            <DropdownMenuItem onSelect={() => _reveal(plugin.path)}>
              <FolderOpen />
              {_isWindows ? t.common.revealInExplorer : t.common.revealInFinder}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={plugin.version === "unknown" || reloading}
              onSelect={() => void handleReload()}
            >
              <RefreshCw className={reloading ? "animate-spin" : undefined} />
              {t.common.reload}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={uninstalling}
              onSelect={() => setConfirmOpen(true)}
            >
              <Trash2 />
              {t.settings.plugins.uninstall}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={formatString(t.settings.plugins.uninstallTitle, {
          name: plugin.displayName,
        })}
        description={
          <>
            {t.settings.plugins.uninstallPrefix}
            <span className="font-mono">{plugin.path}</span>
            {t.settings.plugins.uninstallSuffix}
          </>
        }
        confirmLabel={t.settings.plugins.uninstall}
        dimBackground={false}
        onConfirm={() => void handleUninstall()}
      />
    </div>
  );
}

function PluginEditor({
  plugin,
  onChanged,
}: {
  plugin: PluginView | null;
  onChanged: (plugins: PluginView[]) => void;
}) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<JsonObject>(plugin?.settings ?? {});
  const [reloading, setReloading] = useState(false);
  const settingsError = plugin?.extensions.find(
    (extension) => extension.kind === "settings" && extension.error
  );

  useEffect(() => {
    if (!plugin) return;
    setSettings(plugin.settings);
  }, [plugin, plugin?.settings]);

  if (!plugin) {
    return (
      <div className="text-muted-foreground flex min-w-0 grow items-center justify-center text-sm">
        {t.settings.plugins.selectFromSidebar}
      </div>
    );
  }

  const saveSettings = async (next: JsonObject) => {
    if (JSON.stringify(next) === JSON.stringify(plugin.settings)) return;
    try {
      onChanged(await setPluginSettings(plugin.id, next));
    } catch (error) {
      _showError(error);
    }
  };

  const errors = [
    plugin.error,
    ...plugin.extensions.map((extension) => extension.error),
  ].filter(
    (error, index, all) =>
      error && all.findIndex((item) => item?.id === error.id) === index
  );
  const extensionGroups = EXTENSION_KIND_ORDER.map((kind) => ({
    kind,
    extensions: plugin.extensions.filter(
      (extension) => extension.kind === kind
    ),
  })).filter((group) => group.extensions.length > 0);

  return (
    <div className="flex min-w-0 grow flex-col overflow-hidden pl-6">
      <Tabs
        defaultValue="general"
        className="min-h-0 w-full min-w-0 grow gap-0 overflow-hidden"
      >
        <div className="shrink-0 space-y-4 pr-4">
          <div className="flex items-start gap-3">
            <PluginIcon plugin={plugin} className="size-10" />
            <div className="min-w-0 grow">
              <div className="flex items-center gap-2">
                <h3 className="font-heading truncate text-lg font-medium">
                  {plugin.displayName}
                </h3>
                <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] uppercase">
                  {plugin.status}
                </span>
              </div>
              <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                {plugin.id} · v{plugin.version}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {t.settings.plugins.enabled}
              </span>
              <Switch
                checked={plugin.enabled}
                disabled={
                  plugin.status === "error" && plugin.version === "unknown"
                }
                onCheckedChange={(enabled) =>
                  void setPluginEnabled(plugin.id, enabled)
                    .then(onChanged)
                    .catch(_showError)
                }
              />
            </div>
          </div>

          {plugin.description ? (
            <p className="text-muted-foreground text-sm">
              {plugin.description}
            </p>
          ) : null}

          <div className="flex gap-2">
            {plugin.version !== "unknown" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={reloading}
                onClick={() => {
                  setReloading(true);
                  void reloadPlugin(plugin.id)
                    .then(onChanged)
                    .catch(_showError)
                    .finally(() => setReloading(false));
                }}
              >
                <RefreshCw className={reloading ? "animate-spin" : undefined} />
                {t.common.reload}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => _reveal(plugin.path)}
            >
              <FolderOpen /> {t.settings.plugins.revealFolder}
            </Button>
          </div>

          <TabsList variant="line" className="h-9! flex-row! gap-5">
            <TabsTrigger
              value="general"
              className="w-auto! justify-center! px-0 py-0.5! text-xs uppercase after:inset-x-0! after:inset-y-auto! after:bottom-[-5px]! after:h-0.5! after:w-auto!"
            >
              {t.settings.plugins.tabs.general}
            </TabsTrigger>
            {plugin.settingsSchema || settingsError ? (
              <TabsTrigger
                value="settings"
                className="w-auto! justify-center! px-0 py-0.5! text-xs uppercase after:inset-x-0! after:inset-y-auto! after:bottom-[-5px]! after:h-0.5! after:w-auto!"
              >
                {t.settings.plugins.tabs.settings}
              </TabsTrigger>
            ) : null}
          </TabsList>
        </div>

        <TabsContent
          value="general"
          className="min-h-0 min-w-0 overflow-hidden"
        >
          <ScrollArea className="h-full w-full max-w-full">
            <div className="flex max-w-full min-w-0 flex-col gap-8 pt-5 pr-4 pb-4">
              <section className="space-y-3">
                <h4 className="text-sm font-medium">
                  {t.settings.plugins.pluginHeading}
                </h4>
                <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
                  <span className="text-muted-foreground">
                    {t.settings.plugins.compatibility}
                  </span>
                  <span>
                    {plugin.engineRange ?? t.settings.plugins.notSpecified}
                  </span>
                  {plugin.author ? (
                    <>
                      <span className="text-muted-foreground">
                        {t.settings.plugins.author}
                      </span>
                      <span>{plugin.author}</span>
                    </>
                  ) : null}
                  {plugin.license ? (
                    <>
                      <span className="text-muted-foreground">
                        {t.settings.plugins.license}
                      </span>
                      <span>{plugin.license}</span>
                    </>
                  ) : null}
                  {plugin.homepage ? (
                    <>
                      <span className="text-muted-foreground">
                        {t.settings.plugins.homepage}
                      </span>
                      <Link
                        href={plugin.homepage}
                        className="min-w-0 truncate underline underline-offset-2"
                      >
                        {plugin.homepage}
                      </Link>
                    </>
                  ) : null}
                  <span className="text-muted-foreground">
                    {t.settings.plugins.location}
                  </span>
                  <button
                    type="button"
                    className="hover:text-foreground min-w-0 truncate text-left font-mono underline underline-offset-2"
                    title={formatString(t.settings.plugins.openPath, {
                      path: plugin.path,
                    })}
                    onClick={() => _reveal(plugin.path)}
                  >
                    {plugin.path}
                  </button>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium">
                    {t.settings.plugins.extensions}
                  </h4>
                  <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
                    {plugin.extensions.length}
                  </span>
                </div>
                {plugin.extensions.length > 0 ? (
                  <Accordion
                    type="multiple"
                    defaultValue={extensionGroups.map((group) => group.kind)}
                    className="min-w-0 overflow-hidden rounded-md border"
                  >
                    {extensionGroups.map((group) => {
                      const ExtensionIcon = EXTENSION_KIND_ICONS[group.kind];
                      return (
                        <AccordionItem key={group.kind} value={group.kind}>
                          <AccordionTrigger className="bg-muted/30 data-[state=open]:bg-muted/40 hover:bg-muted/40 rounded-none px-3 py-2.5 hover:no-underline">
                            <span className="flex min-w-0 items-center gap-2.5">
                              <ExtensionIcon
                                className="text-muted-foreground size-4 shrink-0"
                                aria-hidden="true"
                              />
                              <span className="truncate text-xs font-medium">
                                {t.settings.plugins.extensionKinds[group.kind]}
                              </span>
                              <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none tabular-nums">
                                {group.extensions.length}
                              </span>
                            </span>
                          </AccordionTrigger>
                          <AccordionContent className="pb-0">
                            <div className="min-w-0 divide-y overflow-hidden border-t">
                              {group.extensions.map((extension) => (
                                <div
                                  key={extension.id}
                                  className="bg-muted/10 hover:bg-muted/20 flex min-w-0 items-start gap-4 overflow-hidden py-2 pr-3 pl-4 text-xs transition-colors"
                                >
                                  <span
                                    className={cn(
                                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                                      extension.error
                                        ? "bg-destructive"
                                        : extension.active
                                          ? "bg-emerald-500"
                                          : "bg-muted-foreground/40"
                                    )}
                                    title={
                                      extension.error
                                        ? t.settings.plugins.status.error
                                        : extension.active
                                          ? t.settings.plugins.status.active
                                          : t.settings.plugins.status.inactive
                                    }
                                  />
                                  {extension.sourcePath ? (
                                    <button
                                      type="button"
                                      className="hover:text-foreground flex w-0 min-w-0 grow cursor-pointer flex-col overflow-hidden text-left underline-offset-2"
                                      title={formatString(
                                        t.settings.plugins.revealPath,
                                        { path: extension.sourcePath }
                                      )}
                                      onClick={() =>
                                        _reveal(extension.sourcePath!)
                                      }
                                    >
                                      <span className="block w-full truncate hover:underline">
                                        {extension.displayName}
                                      </span>
                                      {extension.description ? (
                                        <span
                                          className="text-muted-foreground line-clamp-2 w-full text-[11px] leading-4"
                                          title={extension.description}
                                        >
                                          {extension.description}
                                        </span>
                                      ) : null}
                                    </button>
                                  ) : (
                                    <span className="flex w-0 min-w-0 grow flex-col overflow-hidden">
                                      <span className="block w-full truncate">
                                        {extension.displayName}
                                      </span>
                                      {extension.description ? (
                                        <span
                                          className="text-muted-foreground line-clamp-2 w-full text-[11px] leading-4"
                                          title={extension.description}
                                        >
                                          {extension.description}
                                        </span>
                                      ) : null}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    {t.settings.plugins.noExtensions}
                  </p>
                )}
              </section>

              {errors.length > 0 ? (
                <section className="min-w-0 space-y-3">
                  <h4 className="text-sm font-medium">
                    {t.settings.plugins.diagnostics}
                  </h4>
                  {errors.map((error) =>
                    error ? (
                      <div
                        key={error.id}
                        className="border-destructive/30 bg-destructive/5 max-w-full min-w-0 overflow-hidden rounded-md border p-3 text-xs"
                      >
                        <p className="[overflow-wrap:anywhere] break-words">
                          {error.summary}
                        </p>
                        <p className="text-muted-foreground mt-1 font-mono [overflow-wrap:anywhere] break-words">
                          error-id: {error.id}
                        </p>
                        <p className="text-muted-foreground font-mono [overflow-wrap:anywhere] break-words">
                          {error.logPath}
                        </p>
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => _reveal(error.logPath)}
                          >
                            <ScrollText /> {t.settings.plugins.revealLog}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void navigator.clipboard.writeText(error.logPath)
                            }
                          >
                            <Copy /> {t.settings.plugins.copyPath}
                          </Button>
                        </div>
                      </div>
                    ) : null
                  )}
                </section>
              ) : null}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="settings" className="min-h-0 pt-5 pr-4 pb-4">
          {settingsError ? (
            <p className="text-destructive text-xs">
              {t.settings.plugins.settingsInvalid}
            </p>
          ) : plugin.settingsSchema ? (
            <ScrollArea className="h-full">
              <div className="max-w-xl pr-3 pb-4">
                <SchemaFields
                  schema={plugin.settingsSchema}
                  value={settings}
                  onChange={setSettings}
                  onCommit={(next) => void saveSettings(next)}
                />
              </div>
            </ScrollArea>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PluginIcon({
  plugin,
  className,
}: {
  plugin: PluginView;
  className?: string;
}) {
  return plugin.iconDataUrl ? (
    <img
      src={plugin.iconDataUrl}
      alt=""
      className={cn("shrink-0 rounded-md object-cover", className)}
    />
  ) : (
    <span
      className={cn(
        "bg-muted flex shrink-0 items-center justify-center rounded-md",
        className
      )}
    >
      <Puzzle className="size-1/2" />
    </span>
  );
}

function _sortPlugins(plugins: PluginView[]): PluginView[] {
  return [...plugins].sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );
}

function SchemaFields({
  schema,
  value,
  onChange,
  onCommit,
  prefix = "",
}: {
  schema: JsonObject;
  value: JsonObject;
  onChange: (value: JsonObject) => void;
  onCommit: (value: JsonObject) => void;
  prefix?: string;
}) {
  const { t } = useI18n();
  const properties = _asObject(schema.properties) ?? {};
  return (
    <div className="space-y-4">
      {Object.entries(properties).map(([key, raw]) => {
        const field = _asObject(raw);
        if (!field) return null;
        const path = prefix ? `${prefix}.${key}` : key;
        const current = _get(value, path);
        if (field.type === "object")
          return (
            <SchemaFields
              key={path}
              schema={field}
              value={value}
              onChange={onChange}
              onCommit={onCommit}
              prefix={path}
            />
          );
        const title = typeof field.title === "string" ? field.title : key;
        const enumValues = Array.isArray(field.enum)
          ? field.enum.filter(_isPrimitive)
          : undefined;
        return (
          <label
            key={path}
            className={cn(
              "bg-muted/15 block rounded-lg border p-4 text-xs",
              field.type === "boolean" &&
                "flex items-center justify-between gap-4"
            )}
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">{title}</span>
              {typeof field.description === "string" ? (
                <span className="text-muted-foreground mt-1 block leading-5">
                  {field.description}
                </span>
              ) : null}
            </span>
            <span
              className={cn(
                "block",
                field.type === "boolean" ? "shrink-0" : "mt-3"
              )}
            >
              {enumValues ? (
                <select
                  className="bg-background h-8 w-full rounded border px-2"
                  value={_displayValue(current)}
                  onChange={(event) => {
                    const selected = enumValues.find(
                      (item) => _displayValue(item) === event.target.value
                    );
                    if (selected === undefined || !_isPrimitive(selected))
                      return;
                    const next = _set(value, path, selected);
                    onChange(next);
                    onCommit(next);
                  }}
                >
                  {enumValues.map((item) => (
                    <option
                      key={_displayValue(item)}
                      value={_displayValue(item)}
                    >
                      {_displayValue(item)}
                    </option>
                  ))}
                </select>
              ) : field.type === "boolean" ? (
                <Switch
                  checked={Boolean(current ?? field.default)}
                  onCheckedChange={(checked) => {
                    const next = _set(value, path, checked);
                    onChange(next);
                    onCommit(next);
                  }}
                />
              ) : field.type === "array" ? (
                <Input
                  value={JSON.stringify(current ?? field.default ?? [])}
                  onChange={(event) => {
                    try {
                      const parsed: unknown = JSON.parse(event.target.value);
                      if (_isJsonValue(parsed))
                        onChange(_set(value, path, parsed));
                    } catch {
                      /* Keep the last valid value while typing. */
                    }
                  }}
                  onBlur={(event) => {
                    try {
                      const parsed: unknown = JSON.parse(event.target.value);
                      if (_isJsonValue(parsed))
                        onCommit(_set(value, path, parsed));
                    } catch {
                      _showError(
                        new Error(
                          formatString(t.settings.plugins.validJsonError, {
                            title,
                          })
                        )
                      );
                    }
                  }}
                />
              ) : (
                <Input
                  type={
                    field.type === "number" || field.type === "integer"
                      ? "number"
                      : "text"
                  }
                  value={_displayValue(current ?? field.default)}
                  onChange={(event) =>
                    onChange(
                      _set(
                        value,
                        path,
                        field.type === "number" || field.type === "integer"
                          ? Number(event.target.value)
                          : event.target.value
                      )
                    )
                  }
                  onBlur={(event) =>
                    onCommit(
                      _set(
                        value,
                        path,
                        field.type === "number" || field.type === "integer"
                          ? Number(event.target.value)
                          : event.target.value
                      )
                    )
                  }
                />
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function _asObject(value: JsonValue | undefined): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
}

function _get(value: JsonObject, dotted: string): JsonValue | undefined {
  let current: JsonValue = value;
  for (const part of dotted.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current))
      return undefined;
    current = current[part];
  }
  return current;
}

function _set(value: JsonObject, dotted: string, next: JsonValue): JsonObject {
  const clone = structuredClone(value);
  const parts = dotted.split(".");
  let current: JsonObject = clone;
  for (const part of parts.slice(0, -1)) {
    current[part] = _asObject(current[part]) ?? {};
    current = current[part];
  }
  current[parts.at(-1)!] = next;
  return clone;
}

function _isPrimitive(
  value: JsonValue
): value is null | boolean | number | string {
  return value === null || typeof value !== "object";
}

function _displayValue(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function _isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(_isJsonValue);
  return typeof value === "object" && Object.values(value).every(_isJsonValue);
}

function _reveal(path: string): void {
  void electrobun.rpc?.request.fsReveal({ path }).catch(_showError);
}

function _showError(error: unknown): void {
  toast.error(error instanceof Error ? error.message : String(error));
}
