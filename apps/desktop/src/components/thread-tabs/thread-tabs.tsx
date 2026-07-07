"use client";

import { Tabs } from "@sinm/react-chrome-tabs";
import "@sinm/react-chrome-tabs/css/chrome-tabs-dark-theme.css";
import "@sinm/react-chrome-tabs/css/chrome-tabs.css";
import { PlusIcon, SidebarCloseIcon, SidebarOpenIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";

import { useTheme } from "@/components/theme-provider";
import { electrobun } from "@/lib/electrobun";
import { cn } from "@/lib/utils";

import { Tooltip } from "../tooltip";
import { Button } from "../ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/context-menu";
import { Kbd, KbdGroup } from "../ui/kbd";

import { ThreadTabPane } from "./thread-tab-pane";
import { TraceTabPane } from "./trace-tab-pane";
import { tabLabel, type AppTab } from "./use-thread-tabs";

const _isWindows =
  typeof navigator !== "undefined" && /Win/i.test(navigator.userAgent);

const REVEAL_LABEL = _isWindows ? "Reveal in Explorer" : "Reveal in Finder";
const MOVE_TO_TRASH_LABEL = _isWindows
  ? "Move to Recycle Bin"
  : "Move to Trash";

// Suppress focus on mouse-down so a click doesn't leave these toolbar icons
// with the focus-visible ring stuck; keyboard focus (Tab) still rings them.
const _preventFocusSteal = (e: MouseEvent) => e.preventDefault();

function _tabIdFromEventTarget(target: EventTarget | null): string | null {
  if (!(target instanceof HTMLElement)) return null;
  return (
    target
      .closest<HTMLElement>(".chrome-tab[data-tab-id]")
      ?.getAttribute("data-tab-id") ?? null
  );
}

interface ThreadTabsProps {
  className?: string;
  tabs: AppTab[];
  activeId: string | null;
  sidebarOpen?: boolean;
  fullScreen?: boolean;
  activate: (id: string) => void;
  refresh: (id: string) => void;
  close: (id: string) => void;
  closeOthers: (id: string) => void;
  closeAll: () => void;
  reveal: (path: string) => void;
  moveToTrash: (path: string) => void;
  reorder: (from: number, to: number) => void;
  /** Create a new thread at the workspace root (auto-named, opened, selected). */
  onNewFile?: () => void;
  onMove?: (from: string, to: string) => void;
  onTraceTitleChange?: (
    projectId: string,
    traceKey: string,
    title: string
  ) => void;
  onToggleSidebar?: () => void;
}

export function ThreadTabs({
  className,
  tabs,
  activeId,
  sidebarOpen = true,
  fullScreen = false,
  activate,
  refresh,
  close,
  closeOthers,
  closeAll,
  reveal,
  moveToTrash,
  reorder,
  onNewFile,
  onMove,
  onTraceTitleChange,
  onToggleSidebar,
}: ThreadTabsProps) {
  const { resolvedTheme } = useTheme();
  // The chrome-tabs lib renders tab DOM imperatively and exposes no tooltip prop,
  // but it stamps each tab's full path onto `data-tab-id`. Mirror that into the
  // native `title` attribute so hovering a tab reveals its relative path. The
  // lib's own updateTab never touches `title`, so this survives label/active
  // updates; we re-apply whenever the tab set changes (covers adds/reorders).
  const containerRef = useRef<HTMLDivElement>(null);
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);
  const contextMenuTab = tabs.find((tab) => tab.id === contextMenuId) ?? null;
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    root
      .querySelectorAll<HTMLElement>(".chrome-tab[data-tab-id]")
      .forEach((el) => {
        const id = el.getAttribute("data-tab-id");
        if (!id) return;
        const tab = tabs.find((tab) => tab.id === id);
        if (!tab) return;
        const label = tabLabel(tab);
        el.title = id;
        el.tabIndex = 0;
        el.setAttribute("role", "tab");
        el.setAttribute("aria-selected", String(id === activeId));
        el.setAttribute("aria-label", `Open ${label}`);
        const closeButton = el.querySelector<HTMLElement>(".chrome-tab-close");
        closeButton?.setAttribute("role", "button");
        closeButton?.setAttribute("tabindex", "0");
        closeButton?.setAttribute("aria-label", `Close ${label}`);
      });
  }, [tabs, activeId]);

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

  const handleContextMenu = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const id = _tabIdFromEventTarget(event.target);
    setContextMenuId(id);
    if (id === null) {
      event.preventDefault();
    }
  }, []);

  const hasOtherTabs =
    contextMenuId !== null && tabs.some((tab) => tab.id !== contextMenuId);

  // The chrome-tabs lib activates a tab on ANY mousedown, so a middle-click
  // close would flash the tab active before closing it. Stop the middle-button
  // mousedown during capture — before it reaches the lib's tab-level listener —
  // and close when the matching middle mouseup lands on the same tab. mouseup
  // is used instead of auxclick because the system WKWebView (the non-CEF
  // renderer) only dispatches auxclick on WebKit ≥ 17.4. A middle-click chorded
  // into a left-button drag (buttons & 1) is ignored on both the press and the
  // release: closing a tab mid-drag would force the lib to end the drag against
  // a stale tab list. Every middle press first clears the pending-close target,
  // and every middle release clears it again, so a press that never released
  // over the strip can't leak into a later gesture and close the wrong tab.
  // preventDefault also disables middle-click autoscroll on Windows/Linux.
  const middlePressedTabIdRef = useRef<string | null>(null);
  const handleMouseDownCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.button !== 1) return;
      middlePressedTabIdRef.current = null;
      if ((event.buttons & 1) !== 0) return;
      const id = _tabIdFromEventTarget(event.target);
      if (id === null) return;
      middlePressedTabIdRef.current = id;
      event.preventDefault();
      event.stopPropagation();
    },
    []
  );

  const handleMouseUp = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.button !== 1) return;
      const pressed = middlePressedTabIdRef.current;
      middlePressedTabIdRef.current = null;
      if ((event.buttons & 1) !== 0) return;
      const id = _tabIdFromEventTarget(event.target);
      if (id !== null && id === pressed) close(id);
    },
    [close]
  );

  return (
    <div
      ref={containerRef}
      className={cn("flex size-full flex-col", className)}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="bg-tabs relative flex w-full"
            onContextMenu={handleContextMenu}
            onMouseDownCapture={handleMouseDownCapture}
            onMouseUp={handleMouseUp}
          >
            <div
              className={cn(
                // border-b-4 continues chrome-tabs' bottom bar across the toggle
                // area, so its color must match that bar (--tab-bar-bottom), not
                // the default --border.
                "flex h-full items-center border-b-4 [border-color:var(--tab-bar-bottom)] pt-1 transition-[width]",
                fullScreen
                  ? "w-6 pl-1"
                  : sidebarOpen
                    ? "w-6 pl-1"
                    : "w-23 pl-18"
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
                  onMouseDown={_preventFocusSteal}
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
              darkMode={resolvedTheme === "dark"}
              tabs={tabs.map((tab) => ({
                id: tab.id,
                title: tabLabel(tab),
                favicon: false,
                active: tab.id === activeId,
              }))}
              pinnedRight={
                <div className="flex h-full items-center pt-0.5 pl-1.5">
                  <Tooltip content="New blank thread">
                    <Button
                      className="hover:bg-primary! rounded-full"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="New blank thread"
                      onMouseDown={_preventFocusSteal}
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
        </ContextMenuTrigger>
        {contextMenuId !== null ? (
          <ContextMenuContent className="w-44">
            <ContextMenuGroup>
              <ContextMenuItem onSelect={() => refresh(contextMenuId)}>
                Refresh
              </ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              <ContextMenuItem onSelect={() => close(contextMenuId)}>
                Close
              </ContextMenuItem>
              <ContextMenuItem
                disabled={!hasOtherTabs}
                onSelect={() => closeOthers(contextMenuId)}
              >
                Close Others
              </ContextMenuItem>
              <ContextMenuItem onSelect={closeAll}>Close All</ContextMenuItem>
            </ContextMenuGroup>
            {contextMenuTab?.type === "thread" && (
              <>
                <ContextMenuSeparator />
                <ContextMenuGroup>
                  <ContextMenuItem onSelect={() => reveal(contextMenuTab.path)}>
                    {REVEAL_LABEL}
                  </ContextMenuItem>
                  <ContextMenuItem
                    variant="destructive"
                    onSelect={() => moveToTrash(contextMenuTab.path)}
                  >
                    {MOVE_TO_TRASH_LABEL}
                  </ContextMenuItem>
                </ContextMenuGroup>
              </>
            )}
          </ContextMenuContent>
        ) : null}
      </ContextMenu>
      <div className="relative min-h-0 flex-1">
        {tabs.map((tab) =>
          tab.type === "thread" ? (
            <ThreadTabPane
              key={tab.id}
              path={tab.path}
              active={tab.id === activeId}
              refreshNonce={tab.refreshNonce ?? 0}
              onMove={onMove}
              onClose={(path) => close(`thread:${path}`)}
            />
          ) : (
            <TraceTabPane
              key={tab.id}
              projectId={tab.projectId}
              traceKey={tab.traceKey}
              active={tab.id === activeId}
              refreshNonce={tab.refreshNonce ?? 0}
              onClose={close}
              onRenameTitle={onTraceTitleChange}
            />
          )
        )}
      </div>
    </div>
  );
}
