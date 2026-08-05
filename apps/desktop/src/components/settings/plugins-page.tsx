"use client";

import type { JsonObject, JsonValue, PluginView } from "@llm-space/core";
import { Link } from "@llm-space/ui/components/link";
import { cn } from "@llm-space/ui/lib/utils";
import { Button } from "@llm-space/ui/ui/button";
import { Input } from "@llm-space/ui/ui/input";
import { ScrollArea } from "@llm-space/ui/ui/scroll-area";
import { Switch } from "@llm-space/ui/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@llm-space/ui/ui/tabs";
import { Textarea } from "@llm-space/ui/ui/textarea";
import {
  Copy,
  FolderOpen,
  Puzzle,
  RefreshCw,
  ScrollText,
  Search,
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
} from "@/client/plugins";
import { electrobun } from "@/lib/electrobun";

import { SettingsPage } from "./settings-page";

export function PluginsPage() {
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
    if (!selectedId || !plugins.some((plugin) => plugin.id === selectedId)) {
      setSelectedId(firstPluginId);
    }
  }, [firstPluginId, plugins, selectedId]);

  const selected = plugins.find((plugin) => plugin.id === selectedId) ?? null;

  return (
    <SettingsPage
      title="Plugins"
      description="Local plugins are trusted and enabled by default. Extension failures are isolated and logged."
      className="flex size-full min-h-0"
    >
      {loading ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-muted-foreground text-sm">Loading…</p>
        </div>
      ) : null}
      {!loading && plugins.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
          <p className="text-muted-foreground max-w-2xl text-sm">
            No plugins discovered. Install plugins at{" "}
            {pluginsPath ? (
              <button
                type="button"
                className="text-foreground max-w-full cursor-pointer truncate align-bottom font-mono underline underline-offset-2"
                title={`Open ${pluginsPath}`}
                onClick={() => _reveal(pluginsPath)}
              >
                {pluginsPath}
              </button>
            ) : (
              "the plugins directory"
            )}
            .
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw className={refreshing ? "animate-spin" : undefined} />
            Refresh
          </Button>
        </div>
      ) : null}
      {!loading && plugins.length > 0 ? (
        <>
          <PluginList
            plugins={plugins}
            selectedId={selectedId}
            refreshing={refreshing}
            onSelect={setSelectedId}
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
  onRefresh,
}: {
  plugins: PluginView[];
  selectedId: string | null;
  refreshing: boolean;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}) {
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
          aria-label="Search plugins"
          placeholder="Search plugins"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <ScrollArea className="min-h-0 grow">
        {filtered.length === 0 ? (
          <p className="text-muted-foreground px-2 py-6 text-center text-xs text-balance">
            No plugin matches &quot;{query.trim()}&quot;.
          </p>
        ) : (
          <div className="flex flex-col gap-1 pr-2">
            {filtered.map((plugin) => (
              <PluginListItem
                key={`${plugin.id}:${plugin.path}`}
                plugin={plugin}
                selected={plugin.id === selectedId}
                onSelect={() => onSelect(plugin.id)}
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
        Refresh plugins
      </Button>
    </div>
  );
}

function PluginListItem({
  plugin,
  selected,
  onSelect,
}: {
  plugin: PluginView;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors",
        selected ? "bg-muted font-medium" : "hover:bg-muted/50"
      )}
      onClick={onSelect}
    >
      <PluginIcon plugin={plugin} className="size-6" />
      <span className="min-w-0 grow">
        <span className="block truncate">{plugin.displayName}</span>
        <span className="text-muted-foreground block truncate text-[10px] font-normal">
          {plugin.id}
        </span>
      </span>
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          plugin.status === "active"
            ? "bg-emerald-500"
            : plugin.status === "disabled"
              ? "bg-muted-foreground/40"
              : plugin.status === "degraded"
                ? "bg-amber-500"
                : "bg-destructive"
        )}
        title={plugin.status}
      />
    </button>
  );
}

function PluginEditor({
  plugin,
  onChanged,
}: {
  plugin: PluginView | null;
  onChanged: (plugins: PluginView[]) => void;
}) {
  const [settings, setSettings] = useState<JsonObject>(plugin?.settings ?? {});
  const [json, setJson] = useState(
    JSON.stringify(plugin?.settings ?? {}, null, 2)
  );
  const [reloading, setReloading] = useState(false);
  const settingsError = plugin?.extensions.find(
    (extension) => extension.kind === "settings" && extension.error
  );

  useEffect(() => {
    if (!plugin) return;
    setSettings(plugin.settings);
    setJson(JSON.stringify(plugin.settings, null, 2));
  }, [plugin, plugin?.settings]);

  if (!plugin) {
    return (
      <div className="text-muted-foreground flex min-w-0 grow items-center justify-center text-sm">
        Select a plugin from the left sidebar
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
              <span className="text-sm font-medium">Enabled</span>
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
                Reload
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => _reveal(plugin.path)}
            >
              <FolderOpen /> Reveal folder
            </Button>
          </div>

          <TabsList variant="line" className="h-9! flex-row! gap-5">
            <TabsTrigger
              value="general"
              className="w-auto! justify-center! px-0 py-0.5! text-xs uppercase after:inset-x-0! after:inset-y-auto! after:bottom-[-5px]! after:h-0.5! after:w-auto!"
            >
              General
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="w-auto! justify-center! px-0 py-0.5! text-xs uppercase after:inset-x-0! after:inset-y-auto! after:bottom-[-5px]! after:h-0.5! after:w-auto!"
            >
              Settings
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="general"
          className="min-h-0 min-w-0 overflow-hidden"
        >
          <ScrollArea className="h-full w-full max-w-full">
            <div className="flex max-w-full min-w-0 flex-col gap-8 pt-5 pr-4 pb-4">
              <section className="space-y-3">
                <h4 className="text-sm font-medium">Plugin</h4>
                <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
                  <span className="text-muted-foreground">Compatibility</span>
                  <span>{plugin.engineRange ?? "Not specified"}</span>
                  {plugin.author ? (
                    <>
                      <span className="text-muted-foreground">Author</span>
                      <span>{plugin.author}</span>
                    </>
                  ) : null}
                  {plugin.license ? (
                    <>
                      <span className="text-muted-foreground">License</span>
                      <span>{plugin.license}</span>
                    </>
                  ) : null}
                  {plugin.homepage ? (
                    <>
                      <span className="text-muted-foreground">Homepage</span>
                      <Link
                        href={plugin.homepage}
                        className="min-w-0 truncate underline underline-offset-2"
                      >
                        {plugin.homepage}
                      </Link>
                    </>
                  ) : null}
                  <span className="text-muted-foreground">Location</span>
                  <button
                    type="button"
                    className="hover:text-foreground min-w-0 truncate text-left font-mono underline underline-offset-2"
                    title={`Open ${plugin.path}`}
                    onClick={() => _reveal(plugin.path)}
                  >
                    {plugin.path}
                  </button>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium">Extensions</h4>
                  <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
                    {plugin.extensions.length}
                  </span>
                </div>
                {plugin.extensions.length > 0 ? (
                  <div className="min-w-0 divide-y overflow-hidden rounded-md border">
                    {plugin.extensions.map((extension) => (
                      <div
                        key={`${extension.kind}:${extension.id}`}
                        className="flex items-center gap-3 px-3 py-2 text-xs"
                      >
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            extension.error
                              ? "bg-destructive"
                              : extension.active
                                ? "bg-emerald-500"
                                : "bg-muted-foreground/40"
                          )}
                        />
                        {extension.sourcePath ? (
                          <button
                            type="button"
                            className="hover:text-foreground min-w-0 grow cursor-pointer truncate text-left underline-offset-2 hover:underline"
                            title={`Reveal ${extension.sourcePath}`}
                            onClick={() => _reveal(extension.sourcePath!)}
                          >
                            {extension.displayName}
                          </button>
                        ) : (
                          <span className="grow truncate">
                            {extension.displayName}
                          </span>
                        )}
                        <span className="text-muted-foreground uppercase">
                          {extension.kind}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    This plugin has no discovered extensions.
                  </p>
                )}
              </section>

              {errors.length > 0 ? (
                <section className="min-w-0 space-y-3">
                  <h4 className="text-sm font-medium">Diagnostics</h4>
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
                            <ScrollText /> Reveal log
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void navigator.clipboard.writeText(error.logPath)
                            }
                          >
                            <Copy /> Copy path
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
              Settings are unavailable because config.schema.json is invalid.
            </p>
          ) : plugin.settingsSchema ? (
            <ScrollArea className="h-full">
              <div className="pr-3">
                <SchemaFields
                  schema={plugin.settingsSchema}
                  value={settings}
                  onChange={setSettings}
                  onCommit={(next) => void saveSettings(next)}
                />
              </div>
            </ScrollArea>
          ) : (
            <Textarea
              className="size-full min-h-0 resize-none font-mono text-xs"
              value={json}
              onChange={(event) => setJson(event.target.value)}
              onBlur={() => {
                try {
                  const next = _parseObject(json);
                  setSettings(next);
                  void saveSettings(next);
                } catch (error) {
                  _showError(error);
                }
              }}
              aria-label={`${plugin.displayName} settings JSON`}
            />
          )}
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
  const properties = _asObject(schema.properties) ?? {};
  return (
    <div className="space-y-3">
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
          <label key={path} className="block space-y-1 text-xs">
            <span className="font-medium">{title}</span>
            {enumValues ? (
              <select
                className="bg-background h-8 w-full rounded border px-2"
                value={_displayValue(current)}
                onChange={(event) => {
                  const selected = enumValues.find(
                    (item) => _displayValue(item) === event.target.value
                  );
                  if (selected === undefined || !_isPrimitive(selected)) return;
                  const next = _set(value, path, selected);
                  onChange(next);
                  onCommit(next);
                }}
              >
                {enumValues.map((item) => (
                  <option key={_displayValue(item)} value={_displayValue(item)}>
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
                    _showError(new Error(`${title} must be valid JSON.`));
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
            {typeof field.description === "string" ? (
              <span className="text-muted-foreground block">
                {field.description}
              </span>
            ) : null}
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

function _parseObject(text: string): JsonObject {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Settings must be a JSON object.");
  return value as JsonObject;
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
