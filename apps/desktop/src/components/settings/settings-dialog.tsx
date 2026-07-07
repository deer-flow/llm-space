"use client";

import { Boxes, Cable, Search, SlidersHorizontal } from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SettingsTab } from "@/shared/commands";

import { GeneralPage } from "./general-page";
import { McpPage } from "./mcp-page";
import { ModelsPage } from "./models-page";
import { SearchPage } from "./search-page";

const PAGES = [
  {
    value: "general",
    label: "General",
    icon: SlidersHorizontal,
    Page: GeneralPage,
  },
  { value: "models", label: "Models", icon: Boxes, Page: ModelsPage },
  { value: "mcp", label: "MCP", icon: Cable, Page: McpPage },
  { value: "search", label: "Search", icon: Search, Page: SearchPage },
] as const;

export function SettingsDialog({
  open,
  onOpenChange,
  tab,
  onTabChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}) {
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
                <Page />
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
