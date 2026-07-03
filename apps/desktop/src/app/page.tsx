import type { ReactNode } from "react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePanelRef } from "react-resizable-panels";

import { CommandProvider, useCommands, useRegisterCommands } from "@/commands";
import { FileSystemTreeView } from "@/components/file-system-tree-view";
import { useModels } from "@/components/model-provider";
import { ThreadTabs, useThreadTabs } from "@/components/thread-tabs";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Welcome } from "@/components/welcome";
import { electrobun } from "@/lib/electrobun";
import { useFullScreen } from "@/lib/use-full-screen";
import type { SettingsTab } from "@/shared/commands";

// Overlay surfaces that aren't part of the first paint — settings, the command
// palette, onboarding. Loaded lazily so their code (and heavy deps like the
// color picker and cmdk) stays out of the initial chunk until first opened.
const SettingsDialog = lazy(() =>
  import("@/components/settings/settings-dialog").then((m) => ({
    default: m.SettingsDialog,
  }))
);
const CommandPalette = lazy(() =>
  import("@/components/command-palette").then((m) => ({
    default: m.CommandPalette,
  }))
);
const OnboardDialog = lazy(() =>
  import("@/components/onboard-dialog").then((m) => ({
    default: m.OnboardDialog,
  }))
);

/**
 * Renders a lazily-loaded overlay only once `open` first becomes true, then
 * keeps it mounted. Deferring the initial mount keeps the overlay's chunk out of
 * first paint; latching it mounted afterwards means its close animation and
 * subsequent opens are instant. The latch is a render-time ref (not an effect)
 * so the lazy `import()` starts in the same render that opens the overlay,
 * without a wasted extra render of the page tree.
 */
function LazyOverlay({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const mounted = useRef(false);
  if (open) mounted.current = true;
  if (!mounted.current) return null;
  return <Suspense fallback={null}>{children}</Suspense>;
}

export function Page() {
  return (
    <CommandProvider>
      <PageInner />
    </CommandProvider>
  );
}

// Commands that need context the palette can't supply (a file path / URL) or
// that make no sense to invoke from the palette itself.
const COMMAND_PALETTE_BLACKLIST = [
  "renameFile",
  "duplicateFile",
  "deleteFile",
  "revealFile",
  "openLink",
  "openCommandPalette",
  "closeTab",
  "closeOtherTabs",
];

function PageInner() {
  const tabs = useThreadTabs();
  const { executeCommand } = useCommands();
  const models = useModels();

  // The active tab is read through a ref so command handlers never go stale.
  const activePathRef = useRef(tabs.activePath);
  activePathRef.current = tabs.activePath;
  const { close, closeOthers, closeAll, reopenClosed } = tabs;

  // Collapse / expand the left side panel.
  const sidebarPanelRef = usePanelRef();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const toggleSidebar = useCallback(() => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand();
    else panel.collapse();
  }, [sidebarPanelRef]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [onboardOpen, setOnboardOpen] = useState(false);

  // Register the command handlers backed by page-level state (tabs, sidebar,
  // settings). `newFile` / `newFolder` / the tree ops are registered by the
  // file tree, which owns that state.
  useRegisterCommands({
    closeTab: ({ path }) => {
      const target = path ?? activePathRef.current;
      if (target) close(target);
    },
    closeOtherTabs: ({ path }) => {
      const target = path ?? activePathRef.current;
      if (target) closeOthers(target);
    },
    closeAllTabs: () => closeAll(),
    reopenClosedTab: () => void reopenClosed(),
    toggleSidebar: () => toggleSidebar(),
    openSettings: ({ tab }) => {
      if (tab) setSettingsTab(tab);
      setSettingsOpen(true);
    },
    openModelSettings: () => {
      setSettingsTab("models");
      setSettingsOpen(true);
    },
    openCommandPalette: () => setCommandPaletteOpen(true),
    openOnboard: () => setOnboardOpen(true),
  });

  // On a fresh launch with no configured models, prompt onboarding. Runs once on
  // mount; adding or removing providers afterwards won't re-trigger it.
  // Deps intentionally empty: this is a one-shot startup check, not reactive.
  useEffect(() => {
    if (models.length === 0) setOnboardOpen(true);
  }, []);

  // Bridge commands dispatched from the bun process (native menu / shortcuts)
  // into the renderer dispatcher.
  useEffect(() => {
    const rpc = electrobun.rpc;
    if (!rpc) return;
    rpc.addMessageListener("executeCommand", executeCommand);
    return () => rpc.removeMessageListener("executeCommand", executeCommand);
  }, [executeCommand]);

  const fullScreen = useFullScreen();

  return (
    <div className="flex size-full flex-col">
      <main className="min-h-0 grow">
        <ResizablePanelGroup>
          <ResizablePanel
            className="bg-sidebar"
            panelRef={sidebarPanelRef}
            collapsible
            collapsedSize={0}
            defaultSize="16.7%"
            minSize={200}
            onResize={(size) => setSidebarOpen(size.inPixels > 0)}
          >
            <FileSystemTreeView
              className="size-full"
              onSelectFile={tabs.open}
              onRemove={tabs.handleRemove}
              onMove={tabs.handleMove}
            />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel minSize={640}>
            {tabs.tabs.length === 0 ? (
              <Welcome
                onNewFile={() => executeCommand({ type: "newFile", args: {} })}
                onModels={() =>
                  executeCommand({
                    type: "openSettings",
                    args: { tab: "models" },
                  })
                }
              />
            ) : (
              <ThreadTabs
                tabs={tabs.tabs}
                activePath={tabs.activePath}
                activate={tabs.activate}
                sidebarOpen={sidebarOpen}
                fullScreen={fullScreen}
                close={(path) =>
                  executeCommand({ type: "closeTab", args: { path } })
                }
                closeOthers={(path) =>
                  executeCommand({ type: "closeOtherTabs", args: { path } })
                }
                closeAll={() =>
                  executeCommand({ type: "closeAllTabs", args: {} })
                }
                reveal={(path) =>
                  executeCommand({ type: "revealFile", args: { path } })
                }
                moveToTrash={(path) =>
                  executeCommand({ type: "deleteFile", args: { path } })
                }
                reorder={tabs.reorder}
                onNewFile={() => executeCommand({ type: "newFile", args: {} })}
                onMove={tabs.handleMove}
                onToggleSidebar={() =>
                  executeCommand({ type: "toggleSidebar", args: {} })
                }
              />
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
      <LazyOverlay open={settingsOpen}>
        <SettingsDialog
          tab={settingsTab}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onTabChange={setSettingsTab}
        />
      </LazyOverlay>
      <LazyOverlay open={commandPaletteOpen}>
        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
          blacklist={COMMAND_PALETTE_BLACKLIST}
        />
      </LazyOverlay>
      <LazyOverlay open={onboardOpen}>
        <OnboardDialog open={onboardOpen} onOpenChange={setOnboardOpen} />
      </LazyOverlay>
    </div>
  );
}
