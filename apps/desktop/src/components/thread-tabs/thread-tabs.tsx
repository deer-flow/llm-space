"use client";

import { Tabs } from "@sinm/react-chrome-tabs";
import "@sinm/react-chrome-tabs/css/chrome-tabs-dark-theme.css";
import "@sinm/react-chrome-tabs/css/chrome-tabs.css";
import { PlusIcon, SidebarCloseIcon, SidebarOpenIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { electrobun } from "@/lib/electrobun";
import { cn } from "@/lib/utils";

import { Tooltip } from "../tooltip";
import { Button } from "../ui/button";
import { Kbd, KbdGroup } from "../ui/kbd";

import { ThreadTabPane } from "./thread-tab-pane";
import { tabLabel } from "./use-thread-tabs";

interface ThreadTabsProps {
  className?: string;
  tabs: string[];
  activePath: string | null;
  sidebarOpen?: boolean;
  fullScreen?: boolean;
  activate: (path: string) => void;
  close: (path: string) => void;
  reorder: (from: number, to: number) => void;
  /** Create a new thread at the workspace root (auto-named, opened, selected). */
  onNewFile?: () => void;
  onToggleSidebar?: () => void;
}

export function ThreadTabs({
  className,
  tabs,
  activePath,
  sidebarOpen = true,
  fullScreen = false,
  activate,
  close,
  reorder,
  onNewFile,
  onToggleSidebar,
}: ThreadTabsProps) {
  // The chrome-tabs lib renders tab DOM imperatively and exposes no tooltip prop,
  // but it stamps each tab's full path onto `data-tab-id`. Mirror that into the
  // native `title` attribute so hovering a tab reveals its relative path. The
  // lib's own updateTab never touches `title`, so this survives label/active
  // updates; we re-apply whenever the tab set changes (covers adds/reorders).
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    root
      .querySelectorAll<HTMLElement>(".chrome-tab[data-tab-id]")
      .forEach((el) => {
        const id = el.getAttribute("data-tab-id");
        if (!id) return;
        const label = tabLabel(id);
        el.title = id;
        el.tabIndex = 0;
        el.setAttribute("role", "tab");
        el.setAttribute("aria-selected", String(id === activePath));
        el.setAttribute("aria-label", `Open ${label}`);
        const closeButton = el.querySelector<HTMLElement>(".chrome-tab-close");
        closeButton?.setAttribute("role", "button");
        closeButton?.setAttribute("tabindex", "0");
        closeButton?.setAttribute("aria-label", `Close ${label}`);
      });
  }, [tabs, activePath]);

  const handleTabsHeaderDoubleClick = useCallback((e: Event) => {
    if (!electrobun.rpc) {
      return;
    }
    if (
      e.target instanceof HTMLElement &&
      e.target.classList.contains("chrome-tabs")
    ) {
      void electrobun.rpc.request.toggleMaximized({});
    }
  }, []);

  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const tabsContainer = root.querySelector(".chrome-tabs");
    if (!tabsContainer) return;

    if (
      !tabsContainer.classList.contains("electrobun-webkit-app-region-drag")
    ) {
      tabsContainer.classList.add("electrobun-webkit-app-region-drag");
    }

    tabsContainer.addEventListener(
      "dblclick",
      handleTabsHeaderDoubleClick,
      true
    );
    return () => {
      tabsContainer.removeEventListener(
        "dblclick",
        handleTabsHeaderDoubleClick,
        true
      );
    };
  }, [tabs.length, handleTabsHeaderDoubleClick]);

  return (
    <div
      ref={containerRef}
      className={cn("flex size-full flex-col", className)}
    >
      <div className="bg-tabs relative flex w-full">
        <div
          className={cn(
            "flex h-full items-center border-b-4 pt-1 transition-[width]",
            fullScreen ? "w-6 pl-1" : sidebarOpen ? "w-6 pl-1" : "w-23 pl-18"
          )}
        >
          <Tooltip
            content={
              <>
                {sidebarOpen ? "Hide sidebar" : "Show sidebar"}{" "}
                <KbdGroup>
                  <Kbd className="text-foreground!">⌘ B</Kbd>
                </KbdGroup>
              </>
            }
          >
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              onClick={onToggleSidebar}
            >
              {sidebarOpen ? (
                <SidebarCloseIcon className="size-4" />
              ) : (
                <SidebarOpenIcon className="size-4" />
              )}
            </Button>
          </Tooltip>
        </div>
        <Tabs
          className="grow"
          darkMode
          tabs={tabs.map((path) => ({
            id: path,
            title: tabLabel(path),
            favicon: false,
            active: path === activePath,
          }))}
          pinnedRight={
            <div className="flex h-full items-center pt-0.5 pl-1.5">
              <Tooltip content="New file">
                <Button
                  className="hover:bg-primary! rounded-full"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="New file"
                  onClick={onNewFile}
                >
                  <PlusIcon className="size-3.5" />
                </Button>
              </Tooltip>
            </div>
          }
          onTabActive={activate}
          onTabClose={close}
          onTabReorder={(_id, from, to) => reorder(from, to)}
        />
      </div>
      <div className="relative min-h-0 flex-1">
        {tabs.map((path) => (
          <ThreadTabPane key={path} path={path} active={path === activePath} />
        ))}
      </div>
    </div>
  );
}
