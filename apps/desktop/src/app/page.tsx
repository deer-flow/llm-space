import { FirecrawlLimitDialog } from "@llm-space/ui/components/firecrawl-limit-dialog";
import { useModels } from "@llm-space/ui/components/model-provider";
import { Button } from "@llm-space/ui/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@llm-space/ui/ui/resizable";
import { FileTextIcon, GitBranchIcon } from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePanelRef } from "react-resizable-panels";
import { toast } from "sonner";

import { CommandProvider, useCommands, useRegisterCommands } from "@/commands";
import { AccountStatus } from "@/components/account-status";
import { useExperimental } from "@/components/experimental-provider";
import { FeatureReminderDialog } from "@/components/feature-reminder-dialog";
import { FileSystemTreeView } from "@/components/file-system-tree-view";
import { GithubAuthProvider } from "@/components/github-auth-provider";
import { GithubDeviceDialog } from "@/components/github-device-dialog";
import { GithubStarReminder } from "@/components/github-star-reminder";
import { SharedImportProvider } from "@/components/shared-import-provider";
import { ThreadTabs, useThreadTabs } from "@/components/thread-tabs";
import { UpdateIndicator } from "@/components/update-indicator";
import { UpdateStatusProvider } from "@/components/update-status-provider";
import { Welcome } from "@/components/welcome";
import { DesktopHostProvider } from "@/host/host-services";
import { track } from "@/lib/analytics";
import { electrobun } from "@/lib/electrobun";
import {
  importThreadFileRecords,
  importThreadFiles,
  type ThreadImportFile,
} from "@/lib/import-threads";
import { useFullScreen } from "@/lib/use-full-screen";
import type { SettingsTab } from "@/shared/commands";
import type { TraceRecord } from "@/shared/traces";

// Overlay surfaces that aren't part of the first paint — settings, the command
// palette, onboarding, and examples. Loaded lazily so their code (and heavy
// deps like the color picker and cmdk) stays out of the initial chunk until
// first opened.
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
const StartFromExampleDialog = lazy(() =>
  import("@/components/start-from-example-dialog").then((m) => ({
    default: m.StartFromExampleDialog,
  }))
);
const ShareThreadDialog = lazy(() =>
  import("@/components/share-thread-dialog").then((m) => ({
    default: m.ShareThreadDialog,
  }))
);
const LazyTracePanel = lazy(() =>
  import("@/components/trace-panel").then((m) => ({
    default: m.TracePanel,
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
function LazyMount({
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

function _SidebarModeSwitch({
  mode,
  onModeChange,
}: {
  mode: "files" | "traces";
  onModeChange: (mode: "files" | "traces") => void;
}) {
  return (
    <div className="bg-muted/60 grid w-full grid-cols-2 rounded-md p-0.5">
      <Button
        className="h-6 justify-center px-2"
        variant={mode === "files" ? "secondary" : "ghost"}
        size="sm"
        aria-pressed={mode === "files"}
        onClick={() => onModeChange("files")}
      >
        <FileTextIcon className="size-3" />
        Files
      </Button>
      <Button
        className="relative h-6 justify-center px-2"
        variant={mode === "traces" ? "secondary" : "ghost"}
        size="sm"
        aria-pressed={mode === "traces"}
        onClick={() => onModeChange("traces")}
      >
        <GitBranchIcon className="size-3" />
        Traces
        <span className="border-primary/30 bg-primary/10 text-primary absolute top-1 right-2 rounded px-1 py-px text-[0.5rem] leading-none font-semibold tracking-wide uppercase">
          Beta
        </span>
      </Button>
    </div>
  );
}

export function Page() {
  return (
    <CommandProvider>
      <DesktopHostProvider>
        <UpdateStatusProvider>
          <GithubAuthProvider>
            <PageInner />
          </GithubAuthProvider>
        </UpdateStatusProvider>
      </DesktopHostProvider>
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
  "revealInTree",
  "copyFile",
  "openLink",
  "openCommandPalette",
  "openVariables",
  "newFileFromPromptExample",
  "closeTab",
  "closeOtherTabs",
  "createTraceProject",
  "createConnectedTraceProject",
  "importLangfuseTraceFiles",
  "syncLangfuseTraceIds",
  // Fullscreen remains a native-menu/window shortcut rather than a palette item.
  "toggleFullScreen",
  // Only meaningful from the "ready to install" toast; a bare palette
  // invocation would silently no-op (or restart mid-work).
  "applyUpdateAndRestart",
];

/** Whether a drag carries OS files (vs. the tree's internal node-reorder drag). */
function hasFiles(e: React.DragEvent): boolean {
  return e.dataTransfer.types.includes("Files");
}

// Persisted width (in px) of the sidebar file-tree panel, so it survives
// restarts. Collapsing sets the panel to 0 — we never store that, so reopening
// restores the last dragged width.
const SIDEBAR_SIZE_KEY = "llm-space:sidebar-size";
const DEFAULT_SIDEBAR_SIZE = "16.7%";

function readSidebarSize(): number | string {
  try {
    const raw = localStorage.getItem(SIDEBAR_SIZE_KEY);
    const size = raw ? Number(raw) : NaN;
    if (Number.isFinite(size) && size > 0) return size;
  } catch {
    // localStorage unavailable — fall back to the default.
  }
  return DEFAULT_SIDEBAR_SIZE;
}

function writeSidebarSize(sizeInPixels: number): void {
  try {
    localStorage.setItem(SIDEBAR_SIZE_KEY, String(Math.round(sizeInPixels)));
  } catch {
    // Ignore write failures (e.g. storage disabled / full).
  }
}

function PageInner() {
  const tabs = useThreadTabs();
  const { executeCommand } = useCommands();
  const models = useModels();
  const { tracingEnabled } = useExperimental();

  // The active tab is read through a ref so command handlers never go stale.
  // The ref is read only inside post-commit command handlers, so the sync
  // lives in a passive effect rather than the render body.
  const activeTabIdRef = useRef(tabs.activeId);
  useEffect(() => {
    activeTabIdRef.current = tabs.activeId;
  });
  const {
    close,
    closeOthers,
    closeAll,
    openTrace,
    reopenClosed,
    activateNext,
    activatePrevious,
  } = tabs;

  // Collapse / expand the left side panel. The initial width is recovered from
  // localStorage once (lazy ref init) and fed straight into `defaultSize`, so
  // restoring it costs no extra render on startup.
  const sidebarPanelRef = usePanelRef();
  const defaultSidebarSize = useRef(readSidebarSize());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const toggleSidebar = useCallback(() => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand();
    else panel.collapse();
  }, [sidebarPanelRef]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  // One event per open transition, no matter which command opened Settings.
  useEffect(() => {
    if (settingsOpen) track({ event: "settings_opened", properties: {} });
  }, [settingsOpen]);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // The thread path being shared (a specific file, or the resolved active tab).
  const shareTargetRef = useRef("");
  const [sidebarMode, setSidebarMode] = useState<"files" | "traces">("files");
  // Which folder a chosen example's thread is created into (default: root).
  const examplesParentRef = useRef("");

  // File import: a hidden picker (opened by the `importFiles` command), the
  // parent directory it should import into, and page-wide drag-and-drop state.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingParentRef = useRef("");
  const dragDepthRef = useRef(0);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const { open: openTab } = tabs;
  const handleImportFiles = useCallback(
    async (files: FileList | File[] | ThreadImportFile[], parent: string) => {
      const list = [...files];
      if (list.length === 0) return;
      const { created, total } =
        list[0] instanceof File
          ? await importThreadFiles(parent, list as File[], models)
          : await importThreadFileRecords(
              parent,
              list as ThreadImportFile[],
              models
            );
      if (created.length === 0) {
        toast.error("No threads could be imported from the selected files.");
        return;
      }
      executeCommand({ type: "refreshTree", args: {} });
      for (const path of created) openTab(path);
      const skipped = total - created.length;
      toast.success(
        `Imported ${created.length} thread${created.length === 1 ? "" : "s"}`,
        skipped > 0 ? { description: `${skipped} file(s) skipped` } : undefined
      );
    },
    [models, executeCommand, openTab]
  );

  // Register the command handlers backed by page-level state (tabs, sidebar,
  // settings). `newFile` / `newFolder` / the tree ops are registered by the
  // file tree, which owns that state.
  useRegisterCommands({
    closeTab: ({ id, path }) => {
      const target = id ?? (path ? `thread:${path}` : activeTabIdRef.current);
      if (target) close(target);
    },
    closeOtherTabs: ({ id, path }) => {
      const target = id ?? (path ? `thread:${path}` : activeTabIdRef.current);
      if (target) closeOthers(target);
    },
    closeAllTabs: () => closeAll(),
    reopenClosedTab: () => void reopenClosed(),
    selectNextTab: () => activateNext(),
    selectPreviousTab: () => activatePrevious(),
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
    openStartFromExample: ({ parent = "" }) => {
      examplesParentRef.current = parent;
      setExamplesOpen(true);
    },
    // Share a specific thread, or the active thread when no path is given (the
    // header button / native menu / palette). The active tab id is `thread:{path}`.
    shareThread: ({ path }) => {
      const activeId = activeTabIdRef.current;
      const target =
        path ??
        (activeId?.startsWith("thread:")
          ? activeId.slice("thread:".length)
          : undefined);
      if (!target) return;
      shareTargetRef.current = target;
      setShareOpen(true);
    },
    importFiles: ({ parent = "", files }) => {
      if (files) {
        void handleImportFiles(files, parent);
        return;
      }
      pendingParentRef.current = parent;
      fileInputRef.current?.click();
    },
  });

  // On a fresh launch with no configured models, prompt onboarding. Runs once on
  // mount; adding or removing providers afterwards won't re-trigger it.
  // Deps intentionally empty: this is a one-shot startup check, not reactive.
  useEffect(() => {
    if (models.length === 0) setOnboardOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot startup check; must not re-run when models change
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
  const handleOpenTrace = useCallback(
    (trace: TraceRecord) => {
      openTrace({
        projectId: trace.projectId,
        traceKey: trace.key,
        title: trace.title,
      });
    },
    [openTrace]
  );
  const handleCloseTab = useCallback(
    (id: string) => executeCommand({ type: "closeTab", args: { id } }),
    [executeCommand]
  );
  const handleCloseOtherTabs = useCallback(
    (id: string) => executeCommand({ type: "closeOtherTabs", args: { id } }),
    [executeCommand]
  );
  const handleCloseAllTabs = useCallback(
    () => executeCommand({ type: "closeAllTabs", args: {} }),
    [executeCommand]
  );
  const handleRevealFile = useCallback(
    (path: string) => executeCommand({ type: "revealFile", args: { path } }),
    [executeCommand]
  );
  const handleMoveToTrash = useCallback(
    (path: string) => executeCommand({ type: "deleteFile", args: { path } }),
    [executeCommand]
  );
  const handleShareThread = useCallback(
    (path: string) => executeCommand({ type: "shareThread", args: { path } }),
    [executeCommand]
  );
  const handleNewFile = useCallback(
    () => executeCommand({ type: "newFile", args: {} }),
    [executeCommand]
  );
  const handleToggleSidebar = useCallback(
    () => executeCommand({ type: "toggleSidebar", args: {} }),
    [executeCommand]
  );
  // The Traces sidebar is gated behind the tracing (beta) experiment. With it
  // off, hide the mode switch and pin the sidebar to files.
  const effectiveSidebarMode = tracingEnabled ? sidebarMode : "files";

  return (
    <div
      className="relative flex size-full flex-col"
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepthRef.current += 1;
        setIsDraggingFiles(true);
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        dragDepthRef.current -= 1;
        if (dragDepthRef.current <= 0) {
          dragDepthRef.current = 0;
          setIsDraggingFiles(false);
        }
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepthRef.current = 0;
        setIsDraggingFiles(false);
        void handleImportFiles(e.dataTransfer.files, "");
      }}
    >
      <SharedImportProvider />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".json,application/json"
        aria-label="Import thread files"
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) {
            void handleImportFiles(files, pendingParentRef.current);
          }
          e.target.value = "";
        }}
      />
      <main className="min-h-0 grow">
        <ResizablePanelGroup>
          <ResizablePanel
            className="bg-sidebar flex flex-col"
            panelRef={sidebarPanelRef}
            collapsible
            collapsedSize={0}
            defaultSize={defaultSidebarSize.current}
            minSize={200}
            onResize={(size) => {
              setSidebarOpen(size.inPixels > 0);
              // Persist the dragged width, but never the collapsed (0) state so
              // reopening restores the last real width.
              if (size.inPixels > 0) writeSidebarSize(size.inPixels);
            }}
          >
            <FileSystemTreeView
              className={
                effectiveSidebarMode === "files" ? "min-h-0 flex-1" : "hidden"
              }
              onSelectFile={tabs.open}
              onRemove={tabs.handleRemove}
              onMove={tabs.handleMove}
            />
            {tracingEnabled && (
              <LazyMount open={effectiveSidebarMode === "traces"}>
                <LazyTracePanel
                  className={
                    effectiveSidebarMode === "traces"
                      ? "min-h-0 flex-1"
                      : "hidden"
                  }
                  onOpenTrace={handleOpenTrace}
                />
              </LazyMount>
            )}
            {tracingEnabled && (
              <div className="border-border/70 electrobun-webkit-app-region-no-drag flex shrink-0 border-t px-3 py-2">
                <_SidebarModeSwitch
                  mode={sidebarMode}
                  onModeChange={setSidebarMode}
                />
              </div>
            )}
            <AccountStatus />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel minSize={640}>
            {tabs.tabs.length === 0 ? (
              <Welcome
                onNewStarter={() => setExamplesOpen(true)}
                onNewFile={() =>
                  executeCommand({
                    type: "newFile",
                    args: {},
                  })
                }
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
                activeId={tabs.activeId}
                activate={tabs.activate}
                refresh={tabs.refresh}
                consumeDiscardedPane={tabs.consumeDiscardedPane}
                sidebarOpen={sidebarOpen}
                fullScreen={fullScreen}
                close={handleCloseTab}
                closeOthers={handleCloseOtherTabs}
                closeAll={handleCloseAllTabs}
                reveal={handleRevealFile}
                moveToTrash={handleMoveToTrash}
                share={handleShareThread}
                reorder={tabs.reorder}
                onNewFile={handleNewFile}
                onMove={tabs.handleMove}
                onTraceTitleChange={tabs.handleTraceTitleChange}
                onToggleSidebar={handleToggleSidebar}
                toolbarSlot={<UpdateIndicator />}
              />
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
      <FirecrawlLimitDialog />
      <GithubDeviceDialog />
      <GithubStarReminder />
      <FeatureReminderDialog />
      <LazyMount open={settingsOpen}>
        <SettingsDialog
          tab={settingsTab}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onTabChange={setSettingsTab}
        />
      </LazyMount>
      <LazyMount open={commandPaletteOpen}>
        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
          blacklist={COMMAND_PALETTE_BLACKLIST}
        />
      </LazyMount>
      <LazyMount open={onboardOpen}>
        <OnboardDialog open={onboardOpen} onOpenChange={setOnboardOpen} />
      </LazyMount>
      <LazyMount open={shareOpen}>
        <ShareThreadDialog
          open={shareOpen}
          path={shareTargetRef.current}
          onOpenChange={setShareOpen}
        />
      </LazyMount>
      <LazyMount open={examplesOpen}>
        <StartFromExampleDialog
          open={examplesOpen}
          onOpenChange={setExamplesOpen}
          onSelectExample={(example) =>
            executeCommand({
              type: "newFileFromPromptExample",
              args: {
                exampleId: example.id,
                parent: examplesParentRef.current,
              },
            })
          }
        />
      </LazyMount>
      {isDraggingFiles && (
        <div className="border-primary bg-primary/10 text-primary pointer-events-none absolute inset-3 z-50 flex items-center justify-center rounded-lg border-2 border-dashed text-sm font-medium backdrop-blur-sm">
          Drop files to import as threads
        </div>
      )}
    </div>
  );
}
