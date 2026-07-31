"use client";

import { ModelProvider } from "@llm-space/ui/components/model-provider";
import { Dialog, DialogContent } from "@llm-space/ui/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@llm-space/ui/ui/tabs";
import {
  Boxes,
  Cable,
  CircleUser,
  FlaskConical,
  Network,
  Server,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";

import { getDefaultRuntime } from "@/client/remote-servers";
import { createElectrobunModelClient } from "@/host/host-services";
import type { SettingsTab } from "@/shared/commands";
import type { RuntimeId } from "@/shared/runtime";

import { AccountPage } from "./account-page";
import { ExperimentalPage } from "./experimental-page";
import { GeneralPage } from "./general-page";
import { McpPage } from "./mcp-page";
import { ModelsPage } from "./models-page";
import { NetworkPage } from "./network-page";
import { RemoteServersPage } from "./remote-servers-page";
import { SearchPage } from "./search-page";
import { SkillsPage } from "./skills-page";

const PAGES = [
  {
    value: "general",
    label: "General",
    icon: SlidersHorizontal,
    Page: () => <GeneralPage />,
  },
  {
    value: "account",
    label: "Account",
    icon: CircleUser,
    Page: () => <AccountPage />,
  },
  {
    value: "remote",
    label: "Remote",
    icon: Server,
    Page: ({
      canConnect,
      canDisconnect,
      acquireConnect,
      acquireDisconnect,
      onConnected,
      onDisconnected,
    }: {
      canConnect?: () => boolean;
      canDisconnect?: (runtimeId: RuntimeId) => boolean;
      acquireConnect?: () => (() => void) | null;
      acquireDisconnect?: (runtimeId: RuntimeId) => (() => void) | null;
      onConnected?: (runtimeId: RuntimeId) => void;
      onDisconnected?: (runtimeId: RuntimeId) => void | Promise<void>;
    }) => (
      <RemoteServersPage
        canConnect={canConnect}
        canDisconnect={canDisconnect}
        acquireConnect={acquireConnect}
        acquireDisconnect={acquireDisconnect}
        onConnected={onConnected}
        onDisconnected={onDisconnected}
      />
    ),
  },
  {
    value: "models",
    label: "Models",
    icon: Boxes,
    Page: ({ runtimeId }: { runtimeId: RuntimeId }) => (
      <ModelProvider client={createElectrobunModelClient(runtimeId)}>
        <ModelsPage />
      </ModelProvider>
    ),
  },
  {
    value: "mcp",
    label: "MCP",
    icon: Cable,
    Page: ({ runtimeId }: { runtimeId: RuntimeId }) => (
      <McpPage runtimeId={runtimeId} />
    ),
  },
  {
    value: "network",
    label: "Network",
    icon: Network,
    Page: ({ runtimeId }: { runtimeId: RuntimeId }) => (
      <NetworkPage runtimeId={runtimeId} />
    ),
  },
  {
    value: "search",
    label: "Search",
    icon: Search,
    Page: ({ runtimeId }: { runtimeId: RuntimeId }) => (
      <SearchPage runtimeId={runtimeId} />
    ),
  },
  {
    value: "skills",
    label: "Skills",
    icon: Sparkles,
    Page: ({ runtimeId }: { runtimeId: RuntimeId }) => (
      <SkillsPage runtimeId={runtimeId} />
    ),
  },
  {
    value: "experimental",
    label: "Experimental",
    icon: FlaskConical,
    Page: () => <ExperimentalPage />,
  },
] as const;

export function SettingsDialog({
  open,
  onOpenChange,
  tab,
  onTabChange,
  canConnectRemote,
  canDisconnectRemote,
  acquireConnectRemote,
  acquireDisconnectRemote,
  onRemoteConnected,
  onRemoteDisconnected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  canConnectRemote?: () => boolean;
  canDisconnectRemote?: (runtimeId: RuntimeId) => boolean;
  acquireConnectRemote?: () => (() => void) | null;
  acquireDisconnectRemote?: (runtimeId: RuntimeId) => (() => void) | null;
  onRemoteConnected?: (runtimeId: RuntimeId) => void;
  onRemoteDisconnected?: (runtimeId: RuntimeId) => void | Promise<void>;
}) {
  const [runtimeId, setRuntimeId] = useState<RuntimeId>("local");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getDefaultRuntime()
      .then((defaultRuntimeId) => {
        if (!cancelled) setRuntimeId(defaultRuntimeId);
      })
      .catch(() => {
        if (!cancelled) setRuntimeId("local");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl! gap-0 p-0"
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          event.preventDefault();
        }}
      >
        <Tabs
          className="h-[75vh] w-full gap-0"
          orientation="vertical"
          value={tab}
          onValueChange={(value) => onTabChange(value as SettingsTab)}
        >
          <aside className="bg-muted/30 flex w-50 shrink-0 flex-col gap-2 border-r p-3">
            <header>
              <div className="text-base font-medium">Settings</div>
            </header>
            <TabsList className="h-fit w-full flex-col gap-0.5 bg-transparent p-0">
              {PAGES.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value} className="w-full">
                  <Icon />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </aside>
          <div className="min-w-0 grow">
            {PAGES.map(({ value, Page }) => (
              <TabsContent key={value} value={value} className="size-full">
                <Page
                  runtimeId={runtimeId}
                  canConnect={canConnectRemote}
                  canDisconnect={canDisconnectRemote}
                  acquireConnect={acquireConnectRemote}
                  acquireDisconnect={acquireDisconnectRemote}
                  onConnected={onRemoteConnected}
                  onDisconnected={onRemoteDisconnected}
                />
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
