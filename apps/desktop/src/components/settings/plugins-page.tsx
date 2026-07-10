"use client";

import type { PluginLifecycleState, PluginView } from "@llm-space/plugin-api";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { listPlugins, reloadPlugin, setPluginEnabled } from "@/client/plugins";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { SettingsPage } from "./settings-page";

export function PluginsPage() {
  const [plugins, setPlugins] = useState<PluginView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [pendingDisable, setPendingDisable] = useState<PluginView | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setPlugins(await listPlugins());
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to load plugins."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = useCallback(
    async (pluginId: string, action: () => Promise<PluginView[]>) => {
      setPendingIds((current) => new Set(current).add(pluginId));
      try {
        setPlugins(await action());
      } catch (error) {
        toast.error("Plugin update failed", {
          description:
            error instanceof Error ? error.message : "Please try again.",
        });
      } finally {
        setPendingIds((current) => {
          const next = new Set(current);
          next.delete(pluginId);
          return next;
        });
      }
    },
    []
  );

  const handleEnablement = useCallback(
    (plugin: PluginView, enabled: boolean) => {
      if (!enabled) {
        setPendingDisable(plugin);
        return;
      }
      void update(plugin.id, () => setPluginEnabled(plugin.id, true));
    },
    [update]
  );

  const confirmDisable = useCallback(() => {
    const plugin = pendingDisable;
    if (!plugin) {
      return;
    }
    setPendingDisable(null);
    void update(plugin.id, () => setPluginEnabled(plugin.id, false));
  }, [pendingDisable, update]);

  const toggleExpanded = useCallback((pluginId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(pluginId)) {
        next.delete(pluginId);
      } else {
        next.add(pluginId);
      }
      return next;
    });
  }, []);

  return (
    <SettingsPage title="Plugins" className="min-h-0">
      {loading ? (
        <div className="text-muted-foreground flex h-full items-center justify-center">
          <Loader2
            className="size-4 animate-spin"
            aria-label="Loading plugins"
          />
        </div>
      ) : loadError ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
          <span className="text-muted-foreground">{loadError}</span>
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw />
            Retry
          </Button>
        </div>
      ) : plugins.length === 0 ? (
        <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
          No plugins found.
        </div>
      ) : (
        <ScrollArea className="h-full">
          <div className="divide-border divide-y pr-3">
            {plugins.map((plugin) => (
              <PluginRow
                key={plugin.id}
                plugin={plugin}
                expanded={expandedIds.has(plugin.id)}
                pending={pendingIds.has(plugin.id)}
                onToggleExpanded={() => toggleExpanded(plugin.id)}
                onEnabledChange={(enabled) => handleEnablement(plugin, enabled)}
                onReload={() =>
                  void update(plugin.id, () => reloadPlugin(plugin.id))
                }
              />
            ))}
          </div>
        </ScrollArea>
      )}

      <ConfirmDialog
        open={pendingDisable !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDisable(null);
          }
        }}
        title={`Disable ${pendingDisable?.name ?? "plugin"}?`}
        description="Saved plugin contexts and tools will remain in dependent threads, but those capabilities will be unavailable until the plugin is enabled again."
        confirmLabel="Disable plugin"
        dimBackground={false}
        onConfirm={confirmDisable}
      />
    </SettingsPage>
  );
}

function PluginRow({
  plugin,
  expanded,
  pending,
  onToggleExpanded,
  onEnabledChange,
  onReload,
}: {
  plugin: PluginView;
  expanded: boolean;
  pending: boolean;
  onToggleExpanded: () => void;
  onEnabledChange: (enabled: boolean) => void;
  onReload: () => void;
}) {
  const canToggle = plugin.state !== "invalid";
  return (
    <section className="py-3">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="focus-visible:ring-ring/30 flex min-w-0 grow items-center gap-3 rounded-sm text-left outline-none focus-visible:ring-2"
          aria-expanded={expanded}
          onClick={onToggleExpanded}
        >
          <ChevronDown
            className={cn(
              "text-muted-foreground size-4 shrink-0 transition-transform",
              expanded && "rotate-180"
            )}
          />
          <span className="min-w-0 grow">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium">
                {plugin.name}
              </span>
              <PluginState state={plugin.state} />
            </span>
            <span className="text-muted-foreground block truncate text-xs">
              {plugin.id} · {plugin.version} ·{" "}
              {plugin.source === "bundled" ? "Bundled" : "Local development"}
            </span>
          </span>
        </button>

        {plugin.source === "local" ? (
          <Tooltip content="Reload plugin">
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Reload ${plugin.name}`}
              disabled={pending || !plugin.enabled || !plugin.compatible}
              onClick={onReload}
            >
              <RefreshCw className={cn(pending && "animate-spin")} />
            </Button>
          </Tooltip>
        ) : null}
        <Switch
          checked={plugin.enabled}
          disabled={!canToggle || pending}
          aria-label={`${plugin.enabled ? "Disable" : "Enable"} ${plugin.name}`}
          onCheckedChange={onEnabledChange}
        />
      </div>

      {expanded ? <PluginDetails plugin={plugin} /> : null}
    </section>
  );
}

function PluginDetails({ plugin }: { plugin: PluginView }) {
  return (
    <div className="mt-3 ml-7 grid gap-4 border-l pl-4 text-xs">
      {plugin.description ? (
        <p className="text-muted-foreground">{plugin.description}</p>
      ) : null}

      <DetailSection title="Compatibility">
        <span className="text-muted-foreground">
          {plugin.compatible ? "Compatible" : "Incompatible"}
        </span>
      </DetailSection>

      <DetailSection title="Contributions">
        {plugin.contributions.length > 0 ? (
          <ul className="grid gap-1.5">
            {plugin.contributions.map((contribution) => (
              <li key={`${contribution.kind}:${contribution.id}`}>
                <span className="font-medium">{contribution.name}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {contribution.kind} · {contribution.id}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted-foreground">None declared.</span>
        )}
      </DetailSection>

      <DetailSection title="Capabilities">
        <span className="text-muted-foreground">
          {plugin.capabilities.length > 0
            ? plugin.capabilities.join(", ")
            : "None declared."}
        </span>
      </DetailSection>

      <DetailSection title="Diagnostics">
        {plugin.diagnostics.length > 0 ? (
          <ol className="grid gap-2">
            {[...plugin.diagnostics].reverse().map((diagnostic, index) => (
              <li key={`${diagnostic.timestamp ?? index}:${diagnostic.code}`}>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono">{diagnostic.code}</span>
                  <span className="text-muted-foreground">
                    {diagnostic.severity}
                  </span>
                </div>
                <p className="text-muted-foreground break-words">
                  {diagnostic.message}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <span className="text-muted-foreground">No diagnostics.</span>
        )}
      </DetailSection>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-1">
      <h3 className="text-foreground font-medium">{title}</h3>
      {children}
    </section>
  );
}

function PluginState({ state }: { state: PluginLifecycleState }) {
  return (
    <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs font-normal">
      <span className={cn("size-1.5 rounded-full", _stateDotClass(state))} />
      {_stateLabel(state)}
    </span>
  );
}

function _stateLabel(state: PluginLifecycleState): string {
  switch (state) {
    case "discovered":
      return "Discovered";
    case "invalid":
      return "Invalid";
    case "inactive":
      return "Inactive";
    case "activating":
      return "Activating";
    case "active":
      return "Active";
    case "failed":
      return "Failed";
    case "deactivating":
      return "Disabling";
    case "disabled":
      return "Disabled";
  }
}

function _stateDotClass(state: PluginLifecycleState): string {
  switch (state) {
    case "active":
      return "bg-emerald-500";
    case "activating":
    case "deactivating":
      return "bg-amber-400";
    case "failed":
    case "invalid":
      return "bg-destructive";
    case "discovered":
    case "inactive":
    case "disabled":
      return "bg-muted-foreground/50";
  }
}
