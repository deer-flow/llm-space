import { FirecrawlLimitDialog } from "@llm-space/ui/components/firecrawl-limit-dialog";
import {
  ModelProvider,
  useModels,
} from "@llm-space/ui/components/model-provider";
import {
  LOCAL_STORAGE_KEYS,
  readLocalStorage,
  writeLocalStorage,
} from "@llm-space/ui/lib/local-storage";
import { Button } from "@llm-space/ui/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@llm-space/ui/ui/resizable";
import { useQueryClient } from "@tanstack/react-query";
import { FileTextIcon, GitBranchIcon } from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from "react";
import { usePanelRef } from "react-resizable-panels";
import { toast } from "sonner";

import { createFileSystemClient } from "@/client";
import { getDefaultRuntime, listRuntimes } from "@/client/remote-servers";
import { CommandProvider, useCommands, useRegisterCommands } from "@/commands";
import { AccountStatus } from "@/components/account-status";
import { useExperimental } from "@/components/experimental-provider";
import { FeatureReminderDialog } from "@/components/feature-reminder-dialog";
import { FileSystemTreeView } from "@/components/file-system-tree-view";
import { GithubAuthProvider } from "@/components/github-auth-provider";
import { GithubDeviceDialog } from "@/components/github-device-dialog";
import { GithubStarReminder } from "@/components/github-star-reminder";
import { RemoteStatus } from "@/components/remote-status";
import { SharedImportProvider } from "@/components/shared-import-provider";
import {
  chooseActiveTabForRuntime,
  filterTabsForRuntime,
  resolveShareThreadTarget,
  ThreadTabs,
  useThreadTabs,
} from "@/components/thread-tabs";
import { UpdateIndicator } from "@/components/update-indicator";
import { UpdateStatusProvider } from "@/components/update-status-provider";
import { Welcome } from "@/components/welcome";
import {
  createElectrobunModelClient,
  DesktopHostProvider,
} from "@/host/host-services";
import { track } from "@/lib/analytics";
import { electrobun } from "@/lib/electrobun";
import {
  importThreadFileRecords,
  importThreadFiles,
  type ThreadImportFile,
} from "@/lib/import-threads";
import { useFullScreen } from "@/lib/use-full-screen";
import type { SettingsTab } from "@/shared/commands";
import type { RuntimeId } from "@/shared/runtime";
import { buildShareThreadCommand } from "@/shared/share";
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
function LazyMount({ open, children }: { open: boolean; children: ReactNode }) {
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
const DEFAULT_SIDEBAR_SIZE = "16.7%";

function readSidebarSize(): number | string {
  const raw = readLocalStorage(LOCAL_STORAGE_KEYS.sidebarSize);
  const size = raw ? Number(raw) : NaN;
  if (Number.isFinite(size) && size > 0) return size;
  return DEFAULT_SIDEBAR_SIZE;
}

function writeSidebarSize(sizeInPixels: number): void {
  writeLocalStorage(
    LOCAL_STORAGE_KEYS.sidebarSize,
    String(Math.round(sizeInPixels))
  );
}

function clearRuntimeQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  runtimeId: RuntimeId
): void {
  void queryClient.removeQueries({ queryKey: ["thread", runtimeId] });
  void queryClient.removeQueries({ queryKey: ["fs", runtimeId] });
  void queryClient.removeQueries({ queryKey: ["trace", runtimeId] });
}

function threadTabId(path: string, runtimeId: RuntimeId): string {
  return `thread:${runtimeId}:${path}`;
}

function PageInner() {
  const [workspaceRuntimeId, setWorkspaceRuntimeId] =
    useState<RuntimeId>("local");
  const workspaceRuntimeIdRef = useRef<RuntimeId>("local");
  useEffect(() => {
    workspaceRuntimeIdRef.current = workspaceRuntimeId;
  }, [workspaceRuntimeId]);

  return (
    <WorkspaceModelScope runtimeId={workspaceRuntimeId}>
      <PageWorkspace
        workspaceRuntimeId={workspaceRuntimeId}
        setWorkspaceRuntimeId={setWorkspaceRuntimeId}
        workspaceRuntimeIdRef={workspaceRuntimeIdRef}
      />
    </WorkspaceModelScope>
  );
}

function WorkspaceModelScope({
  runtimeId,
  children,
}: {
  runtimeId: RuntimeId;
  children: ReactNode;
}) {
  const client = useMemo(
    () => createElectrobunModelClient(runtimeId),
    [runtimeId]
  );
  return (
    <ModelProvider key={runtimeId} client={client}>
      {children}
    </ModelProvider>
  );
}

function PageWorkspace({
  workspaceRuntimeId,
  setWorkspaceRuntimeId,
  workspaceRuntimeIdRef,
}: {
  workspaceRuntimeId: RuntimeId;
  setWorkspaceRuntimeId: Dispatch<SetStateAction<RuntimeId>>;
  workspaceRuntimeIdRef: MutableRefObject<RuntimeId>;
}) {
  const tabs = useThreadTabs();
  const { executeCommand } = useCommands();
  const models = useModels();
  const queryClient = useQueryClient();
  const { tracingEnabled } = useExperimental();

  const {
    close,
    closeAllInRuntime,
    discardRuntime,
    closeOthersInRuntime,
    openTrace,
    reopenClosed,
  } = tabs;
  const visibleTabs = useMemo(
    () => filterTabsForRuntime(tabs.tabs, workspaceRuntimeId),
    [tabs.tabs, workspaceRuntimeId]
  );
  const visibleActiveId = useMemo(
    () =>
      chooseActiveTabForRuntime(tabs.tabs, tabs.activeId, workspaceRuntimeId),
    [tabs.activeId, tabs.tabs, workspaceRuntimeId]
  );
  // The visible active tab is read through a ref so command handlers never go
  // stale or accidentally target a tab from another runtime.
  const activeTabIdRef = useRef(visibleActiveId);
  useEffect(() => {
    activeTabIdRef.current = visibleActiveId;
  }, [visibleActiveId]);
  const activateVisibleTab = useCallback(
    (id: string) => {
      if (visibleTabs.some((tab) => tab.id === id)) tabs.activate(id);
    },
    [tabs, visibleTabs]
  );
  const reorderVisibleTabs = useCallback(
    (from: number, to: number) =>
      tabs.reorderInRuntime(from, to, workspaceRuntimeId),
    [tabs, workspaceRuntimeId]
  );
  const activateVisibleSibling = useCallback(
    (offset: 1 | -1) => {
      if (visibleTabs.length === 0) return;
      const index = visibleTabs.findIndex((tab) => tab.id === visibleActiveId);
      const next =
        index === -1
          ? offset === 1
            ? visibleTabs[0]
            : visibleTabs[visibleTabs.length - 1]
          : visibleTabs[
              (index + offset + visibleTabs.length) % visibleTabs.length
            ];
      if (next) tabs.activate(next.id);
    },
    [tabs, visibleActiveId, visibleTabs]
  );
  const discardRuntimeWorkspace = useCallback(
    (runtimeId: RuntimeId) => {
      discardRuntime(runtimeId);
      clearRuntimeQueries(queryClient, runtimeId);
    },
    [discardRuntime, queryClient]
  );

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
  // The thread path and runtime being shared. Keep them together so opening the
  // dialog can never silently reinterpret a remote path as local.
  const [shareTarget, setShareTarget] = useState<{
    path: string;
    runtimeId: RuntimeId;
  }>({ path: "", runtimeId: "local" });
  const [sidebarMode, setSidebarMode] = useState<"files" | "traces">("files");
  // Which folder a chosen example's thread is created into (default: root).
  const examplesParentRef = useRef("");

  const switchWorkspaceRuntime = useCallback(
    (nextRuntimeId: RuntimeId) => {
      workspaceRuntimeIdRef.current = nextRuntimeId;
      setWorkspaceRuntimeId(nextRuntimeId);
      setSidebarMode("files");
      void queryClient.invalidateQueries({ queryKey: ["fs"] });
      void queryClient.invalidateQueries({ queryKey: ["thread"] });
    },
    [queryClient, setWorkspaceRuntimeId, workspaceRuntimeIdRef]
  );

  const refreshRuntimes = useCallback(
    async ({ syncDefault }: { syncDefault: boolean }) => {
      const [next, defaultRuntimeId] = await Promise.all([
        listRuntimes(),
        getDefaultRuntime(),
      ]);
      const current = workspaceRuntimeIdRef.current;
      const nextRuntimeId =
        syncDefault && next.some((runtime) => runtime.id === defaultRuntimeId)
          ? defaultRuntimeId
          : next.some((runtime) => runtime.id === current)
            ? current
            : "local";
      if (nextRuntimeId !== current) {
        switchWorkspaceRuntime(nextRuntimeId);
      } else {
        workspaceRuntimeIdRef.current = nextRuntimeId;
        setWorkspaceRuntimeId(nextRuntimeId);
      }
    },
    [setWorkspaceRuntimeId, switchWorkspaceRuntime, workspaceRuntimeIdRef]
  );

  const transitionWorkspaceRuntime = useCallback(
    (nextRuntimeId: RuntimeId) => {
      setSettingsOpen(false);
      switchWorkspaceRuntime(nextRuntimeId);
      void refreshRuntimes({ syncDefault: false });
    },
    [refreshRuntimes, switchWorkspaceRuntime]
  );

  useEffect(() => {
    void refreshRuntimes({ syncDefault: true }).catch(() => undefined);
  }, [refreshRuntimes]);

  useEffect(() => {
    if (settingsOpen) return;
    void refreshRuntimes({ syncDefault: true }).catch(() => undefined);
  }, [refreshRuntimes, settingsOpen]);

  // File import: a hidden picker (opened by the `importFiles` command), the
  // parent directory it should import into, and page-wide drag-and-drop state.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingParentRef = useRef("");
  const pendingImportRuntimeIdRef = useRef<RuntimeId>("local");
  const dragDepthRef = useRef(0);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const { open: openTab } = tabs;
  const handleImportFiles = useCallback(
    async (
      files: FileList | File[] | ThreadImportFile[],
      parent: string,
      runtimeId: RuntimeId = workspaceRuntimeIdRef.current
    ) => {
      const list = [...files];
      if (list.length === 0) return;
      const { created, total, recovered, warnings } =
        list[0] instanceof File
          ? await importThreadFiles(parent, list as File[], models, runtimeId)
          : await importThreadFileRecords(
              parent,
              list as ThreadImportFile[],
              models,
              runtimeId
            );
      if (created.length === 0) {
        toast.error("No threads could be imported from the selected files.", {
          description: warnings[0],
        });
        return;
      }
      executeCommand({ type: "refreshTree", args: { runtimeId } });
      for (const path of created) openTab(path, runtimeId);
      const skipped = total - created.length;
      toast.success(
        `Imported ${created.length} thread${created.length === 1 ? "" : "s"}`,
        skipped > 0 || recovered > 0
          ? {
              description: [
                skipped > 0 ? `${skipped} file(s) skipped` : "",
                recovered > 0
                  ? `${recovered} recovered from truncated JSON`
                  : "",
                warnings[0] ?? "",
              ]
                .filter(Boolean)
                .join(" · "),
            }
          : undefined
      );
    },
    [models, executeCommand, openTab, workspaceRuntimeIdRef]
  );

  // Register the command handlers backed by page-level state (tabs, sidebar,
  // settings). `newFile` / `newFolder` / the tree ops are registered by the
  // file tree, which owns that state.
  useRegisterCommands({
    closeTab: ({ id, path, runtimeId }) => {
      const targetRuntimeId = runtimeId ?? workspaceRuntimeIdRef.current;
      const target =
        id ??
        (path ? threadTabId(path, targetRuntimeId) : activeTabIdRef.current);
      if (target) close(target);
    },
    closeOtherTabs: ({ id, path, runtimeId }) => {
      const targetRuntimeId = runtimeId ?? workspaceRuntimeIdRef.current;
      const target =
        id ??
        (path ? threadTabId(path, targetRuntimeId) : activeTabIdRef.current);
      if (target) closeOthersInRuntime(target, targetRuntimeId);
    },
    closeAllTabs: () => closeAllInRuntime(workspaceRuntimeIdRef.current),
    reopenClosedTab: () => void reopenClosed(),
    selectNextTab: () => activateVisibleSibling(1),
    selectPreviousTab: () => activateVisibleSibling(-1),
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
    openStartFromExample: ({ parent = "", runtimeId }) => {
      if (runtimeId && runtimeId !== workspaceRuntimeId) return;
      examplesParentRef.current = parent;
      setExamplesOpen(true);
    },
    // Share a specific thread, or the active thread when no path is given (the
    // header button / native menu / palette). Thread tab ids are
    // `thread:{runtimeId}:{path}`.
    shareThread: ({ path, runtimeId }) => {
      const activeTab = visibleTabs.find((tab) => tab.id === visibleActiveId);
      const target = resolveShareThreadTarget(
        { path, runtimeId },
        workspaceRuntimeId,
        activeTab?.type === "thread"
          ? { path: activeTab.path, runtimeId: activeTab.runtimeId }
          : null
      );
      if (!target) return;
      setShareTarget(target);
      setShareOpen(true);
    },
    importFiles: ({ parent = "", files, runtimeId }) => {
      const targetRuntimeId = runtimeId ?? workspaceRuntimeIdRef.current;
      if (targetRuntimeId !== workspaceRuntimeIdRef.current) return;
      if (files) {
        void handleImportFiles(files, parent, targetRuntimeId);
        return;
      }
      pendingParentRef.current = parent;
      pendingImportRuntimeIdRef.current = targetRuntimeId;
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
        runtimeId: workspaceRuntimeId,
      });
    },
    [openTrace, workspaceRuntimeId]
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
    (path: string, runtimeId: RuntimeId) =>
      executeCommand({ type: "revealFile", args: { path, runtimeId } }),
    [executeCommand]
  );
  const handleMoveToTrash = useCallback(
    (path: string, runtimeId: RuntimeId) =>
      executeCommand({ type: "deleteFile", args: { path, runtimeId } }),
    [executeCommand]
  );
  const handleShareThread = useCallback(
    (path: string, runtimeId: RuntimeId) =>
      executeCommand(buildShareThreadCommand(path, runtimeId)),
    [executeCommand]
  );
  // Copy the thread file to the OS clipboard as a file reference. The bun-side
  // command takes an absolute path, so resolve the tab's path first.
  const handleCopyFile = useCallback(
    async (path: string, runtimeId: RuntimeId) => {
      try {
        const absolute = await createFileSystemClient(runtimeId).realpath(path);
        executeCommand({ type: "copyFile", args: { path: absolute } });
      } catch (err) {
        toast.error((err as Error).message);
      }
    },
    [executeCommand]
  );
  const handleNewFile = useCallback(
    () =>
      executeCommand({
        type: "newFile",
        args: { runtimeId: workspaceRuntimeId },
      }),
    [executeCommand, workspaceRuntimeId]
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
        void handleImportFiles(
          e.dataTransfer.files,
          "",
          workspaceRuntimeIdRef.current
        );
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
            void handleImportFiles(
              files,
              pendingParentRef.current,
              pendingImportRuntimeIdRef.current
            );
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
              runtimeId={workspaceRuntimeId}
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
                  runtimeId={workspaceRuntimeId}
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
            <RemoteStatus
              runtimeId={workspaceRuntimeId}
              onDisconnecting={discardRuntimeWorkspace}
              onDisconnected={(runtimeId) => {
                discardRuntimeWorkspace(runtimeId);
                if (workspaceRuntimeIdRef.current !== runtimeId) return;
                transitionWorkspaceRuntime("local");
              }}
            />
            <AccountStatus />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel minSize={640}>
            {visibleTabs.length === 0 ? (
              <Welcome
                onNewStarter={() => setExamplesOpen(true)}
                onNewFile={() =>
                  executeCommand({
                    type: "newFile",
                    args: { runtimeId: workspaceRuntimeId },
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
                tabs={visibleTabs}
                activeId={visibleActiveId}
                activate={activateVisibleTab}
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
                copyFile={handleCopyFile}
                reorder={reorderVisibleTabs}
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
          onRemoteConnected={(runtimeId) => {
            transitionWorkspaceRuntime(runtimeId);
          }}
          onRemoteDisconnected={(runtimeId) => {
            discardRuntimeWorkspace(runtimeId);
            if (workspaceRuntimeIdRef.current === runtimeId) {
              transitionWorkspaceRuntime("local");
            }
          }}
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
          path={shareTarget.path}
          runtimeId={shareTarget.runtimeId}
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
                runtimeId: workspaceRuntimeId,
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
