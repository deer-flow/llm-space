import type { Thread } from "@llm-space/core";
import type { EditorCommitScopeHandle } from "@llm-space/ui/components/code-editor/editor-commit-scope";
import { FirecrawlLimitDialog } from "@llm-space/ui/components/firecrawl-limit-dialog";
import {
  useModels,
  useRefreshModels,
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
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { flushSync } from "react-dom";
import { usePanelRef } from "react-resizable-panels";
import { toast } from "sonner";

import { createFileSystemClient } from "@/client";
import {
  installPluginFile,
  isPluginZipFile,
  type PluginActiveTab,
} from "@/client/plugins";
import { getDefaultRuntime, listRuntimes } from "@/client/remote-servers";
import { CommandProvider, useCommands, useRegisterCommands } from "@/commands";
import { AccountStatus } from "@/components/account-status";
import { useExperimental } from "@/components/experimental-provider";
import { FeatureReminderDialog } from "@/components/feature-reminder-dialog";
import { FileSystemTreeView } from "@/components/file-system-tree-view";
import { GithubAuthProvider } from "@/components/github-auth-provider";
import { GithubDeviceDialog } from "@/components/github-device-dialog";
import { GithubStarReminder } from "@/components/github-star-reminder";
import { LazyMount } from "@/components/lazy-mount";
import { PageShareThreadController } from "@/components/page-share-thread-controller";
import { RemoteStatus } from "@/components/remote-status";
import type { ShareThreadTarget } from "@/components/share-thread-dialog-flow";
import { SharedImportProvider } from "@/components/shared-import-provider";
import {
  chooseActiveTabForRuntime,
  filterTabsForRuntime,
  ThreadTabs,
  useThreadTabs,
  type AppTab,
} from "@/components/thread-tabs";
import { acquireFileMutationForTabs } from "@/components/thread-tabs/pane-file-mutation";
import type { PaneLifecycleHost } from "@/components/thread-tabs/pane-lifecycle-host";
import {
  closeAllTabsIfAllowed,
  closeOtherTabsIfAllowed,
  closeTabIfAllowed,
  paneIdForTab,
  refreshTabIfAllowed,
} from "@/components/thread-tabs/pane-mutation-actions";
import { RuntimeRunTracker } from "@/components/thread-tabs/runtime-run-tracker";
import { switchWorkspaceRuntimeIfAllowed } from "@/components/thread-tabs/runtime-workspace-transition";
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

import { invalidateRuntimeSwitchQueries } from "./runtime-switch-queries";
import { WorkspaceModelScope } from "./workspace-model-scope";

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
const ThreadStorageDialog = lazy(() =>
  import("@/components/thread-storage-dialog").then((m) => ({
    default: m.ThreadStorageDialog,
  }))
);
const LazyTracePanel = lazy(() =>
  import("@/components/trace-panel").then((m) => ({
    default: m.TracePanel,
  }))
);

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

type DropKind = "plugins" | "threads" | "mixed";

function droppedFileKind(dataTransfer: DataTransfer): DropKind {
  const files = [...dataTransfer.files];
  const hasPlugin = files.some(isPluginZipFile);
  const hasThread = files.some((file) => !isPluginZipFile(file));
  if (hasPlugin && hasThread) return "mixed";
  return hasPlugin ? "plugins" : "threads";
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
    <WorkspaceModelScope
      runtimeId={workspaceRuntimeId}
      createClient={createElectrobunModelClient}
    >
      <PageWorkspace
        workspaceRuntimeId={workspaceRuntimeId}
        setWorkspaceRuntimeId={setWorkspaceRuntimeId}
        workspaceRuntimeIdRef={workspaceRuntimeIdRef}
      />
    </WorkspaceModelScope>
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
  const runtimeRunTrackerRef = useRef(new RuntimeRunTracker());
  const mutationRevision = useSyncExternalStore(
    runtimeRunTrackerRef.current.subscribe,
    runtimeRunTrackerRef.current.getSnapshot,
    runtimeRunTrackerRef.current.getSnapshot
  );
  const canPruneRestoredTab = useCallback((tab: AppTab) => {
    const paneId = paneIdForTab(tab);
    return (
      !runtimeRunTrackerRef.current.isPaneBusy(paneId) &&
      !runtimeRunTrackerRef.current.isMutationReserved(
        paneId,
        tab.runtimeId,
        tab.type === "thread" ? tab.path : undefined
      )
    );
  }, []);
  const tabs = useThreadTabs({ canPruneRestoredTab });
  const viewCommitHandlesRef = useRef(
    new Map<string, EditorCommitScopeHandle>()
  );
  const commitView = useCallback((paneId: string) => {
    viewCommitHandlesRef.current.get(paneId)?.commitAll();
  }, []);
  const commitViews = useCallback(
    (closingTabs: AppTab[]) => {
      for (const tab of closingTabs) {
        commitView(paneIdForTab(tab));
      }
    },
    [commitView]
  );
  const handleViewCommitScopeReady = useCallback(
    (paneId: string, handle: EditorCommitScopeHandle | null) => {
      if (handle) viewCommitHandlesRef.current.set(paneId, handle);
      else viewCommitHandlesRef.current.delete(paneId);
    },
    []
  );
  const { executeCommand } = useCommands();
  const models = useModels();
  const refreshModels = useRefreshModels();
  const queryClient = useQueryClient();
  const { tracingEnabled } = useExperimental();

  const {
    close,
    closeAllInRuntime,
    discardRuntime,
    closeOthersInRuntime,
    handleMove,
    handleRemove,
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
  const threadStateRef = useRef(new Map<string, Thread>());
  const handleThreadStateChange = useCallback(
    (tabId: string, thread: Thread | null) => {
      if (thread) threadStateRef.current.set(tabId, thread);
      else threadStateRef.current.delete(tabId);
    },
    []
  );
  const getActivePluginTab = useCallback((): PluginActiveTab | null => {
    const activeTab = visibleTabs.find((tab) => tab.id === visibleActiveId);
    if (activeTab?.type !== "thread") return null;
    const thread = threadStateRef.current.get(activeTab.id);
    const filename = activeTab.path.split("/").at(-1);
    return thread && filename
      ? { ...activeTab, tabId: activeTab.id, filename, thread }
      : null;
  }, [visibleActiveId, visibleTabs]);
  const getActiveShareThread = useCallback((): ShareThreadTarget | null => {
    const activeTab = visibleTabs.find((tab) => tab.id === visibleActiveId);
    return activeTab?.type === "thread"
      ? { path: activeTab.path, runtimeId: activeTab.runtimeId }
      : null;
  }, [visibleActiveId, visibleTabs]);
  // The visible active tab is read through a ref so command handlers never go
  // stale or accidentally target a tab from another runtime.
  const activeTabIdRef = useRef(visibleActiveId);
  const allTabsRef = useRef(tabs.tabs);
  useEffect(() => {
    activeTabIdRef.current = visibleActiveId;
  }, [visibleActiveId]);
  useEffect(() => {
    allTabsRef.current = tabs.tabs;
  }, [tabs.tabs]);
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
  const showRuntimeRunBlocked = useCallback((action: string) => {
    toast.info("Wait for active runs to finish", {
      description: `Completed output will be saved before ${action}.`,
    });
  }, []);
  const canDisconnectRuntime = useCallback(
    (runtimeId: RuntimeId) => {
      if (runtimeRunTrackerRef.current.canDisconnect(runtimeId)) return true;
      showRuntimeRunBlocked("disconnecting this runtime");
      return false;
    },
    [showRuntimeRunBlocked]
  );
  const canConnectRemote = useCallback(() => {
    if (!runtimeRunTrackerRef.current.hasAnyRunning()) return true;
    showRuntimeRunBlocked("changing remote connections");
    return false;
  }, [showRuntimeRunBlocked]);
  const handlePaneRunStart = useCallback(
    (paneId: string, runtimeId: RuntimeId, runId: string, path?: string) =>
      runtimeRunTrackerRef.current.beginRun(paneId, runtimeId, runId, path),
    []
  );
  const handlePaneRunSettled = useCallback((paneId: string, runId: string) => {
    runtimeRunTrackerRef.current.settleRun(paneId, runId);
  }, []);
  const handlePanePersistenceChange = useCallback(
    (
      paneId: string,
      runtimeId: RuntimeId,
      owner: object,
      busy: boolean,
      path?: string
    ) => {
      runtimeRunTrackerRef.current.setPersistenceBusy(
        paneId,
        runtimeId,
        owner,
        busy,
        path
      );
    },
    []
  );
  const isPaneMutationReserved = useCallback(
    (paneId: string, runtimeId: RuntimeId, path?: string) =>
      runtimeRunTrackerRef.current.isMutationReserved(paneId, runtimeId, path),
    []
  );
  const acquireFileMutation = useCallback(
    (paths: string[], runtimeId: RuntimeId, action: string) =>
      acquireFileMutationForTabs({
        tracker: runtimeRunTrackerRef.current,
        tabs: allTabsRef.current,
        paths,
        runtimeId,
        onBlocked: () => showRuntimeRunBlocked(action),
      }),
    [showRuntimeRunBlocked]
  );
  const acquireRemoteConnectionMutation = useCallback(() => {
    const release = runtimeRunTrackerRef.current.reserveAll();
    if (release) return release;
    showRuntimeRunBlocked("changing remote connections");
    return null;
  }, [showRuntimeRunBlocked]);
  const acquireRuntimeDisconnectMutation = useCallback(
    (runtimeId: RuntimeId) => {
      const release = runtimeRunTrackerRef.current.reserveRuntime(runtimeId);
      if (release) return release;
      showRuntimeRunBlocked("disconnecting this runtime");
      return null;
    },
    [showRuntimeRunBlocked]
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
  const sidebarOpenRef = useRef(true);
  const sidebarSizeWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const handleSidebarResize = useCallback(
    (size: { inPixels: number }) => {
      const open = size.inPixels > 0;
      if (sidebarOpenRef.current !== open) {
        sidebarOpenRef.current = open;
        setSidebarOpen(open);
      }

      // localStorage writes are synchronous. Coalesce the pointer-move stream
      // into one trailing write so resizing stays on the browser's layout path.
      if (!open) return;
      if (sidebarSizeWriteTimerRef.current !== null) {
        clearTimeout(sidebarSizeWriteTimerRef.current);
      }
      sidebarSizeWriteTimerRef.current = setTimeout(() => {
        sidebarSizeWriteTimerRef.current = null;
        writeSidebarSize(size.inPixels);
      }, 120);
    },
    []
  );
  useEffect(() => {
    return () => {
      if (sidebarSizeWriteTimerRef.current !== null) {
        clearTimeout(sidebarSizeWriteTimerRef.current);
      }
    };
  }, []);
  const toggleSidebar = useCallback(() => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand();
    else panel.collapse();
  }, [sidebarPanelRef]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const handleSettingsOpenChange = useCallback(
    (open: boolean) => {
      setSettingsOpen(open);
      if (!open) void refreshModels();
    },
    [refreshModels]
  );
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [settingsPluginId, setSettingsPluginId] = useState<string>();
  // One event per open transition, no matter which command opened Settings.
  useEffect(() => {
    if (settingsOpen) track({ event: "settings_opened", properties: {} });
  }, [settingsOpen]);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [threadStorageMode, setThreadStorageMode] = useState<
    "save" | "import" | null
  >(null);
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<"files" | "traces">("files");
  // Which folder a chosen example's thread is created into (default: root).
  const examplesParentRef = useRef("");

  const switchWorkspaceRuntime = useCallback(
    (nextRuntimeId: RuntimeId) => {
      const currentRuntimeId = workspaceRuntimeIdRef.current;
      return switchWorkspaceRuntimeIfAllowed({
        tracker: runtimeRunTrackerRef.current,
        currentRuntimeId,
        nextRuntimeId,
        onBlocked: () => showRuntimeRunBlocked("switching runtimes"),
        onSwitch: () => {
          workspaceRuntimeIdRef.current = nextRuntimeId;
          setWorkspaceRuntimeId(nextRuntimeId);
          setSidebarMode("files");
          void invalidateRuntimeSwitchQueries(queryClient, nextRuntimeId);
        },
      });
    },
    [
      queryClient,
      setWorkspaceRuntimeId,
      showRuntimeRunBlocked,
      workspaceRuntimeIdRef,
    ]
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
      if (!switchWorkspaceRuntime(nextRuntimeId)) return;
      setSettingsOpen(false);
      void refreshRuntimes({ syncDefault: false });
    },
    [refreshRuntimes, switchWorkspaceRuntime]
  );

  const commitDisconnectedRuntime = useCallback(
    (runtimeId: RuntimeId) => {
      // The runtime reservation is released as soon as this callback returns.
      // Commit tab removal and any active-runtime transition synchronously so
      // no pane can acquire a fresh run lease against a disconnected runtime
      // in the React scheduling gap.
      flushSync(() => {
        discardRuntimeWorkspace(runtimeId);
        if (workspaceRuntimeIdRef.current === runtimeId) {
          transitionWorkspaceRuntime("local");
        }
      });
    },
    [discardRuntimeWorkspace, transitionWorkspaceRuntime, workspaceRuntimeIdRef]
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
  const [dropKind, setDropKind] = useState<DropKind>("threads");
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
  const handleDroppedFiles = useCallback(
    async (files: FileList) => {
      const pluginFiles = [...files].filter(isPluginZipFile);
      const threadFiles = [...files].filter((file) => !isPluginZipFile(file));

      for (const file of pluginFiles) {
        try {
          const result = await installPluginFile(file);
          toast.success(`Installed ${result.pluginId} v${result.version}`, {
            description: "The existing plugin was replaced and reloaded.",
            action: {
              label: "View plugin",
              onClick: () => {
                setSettingsPluginId(result.pluginId);
                setSettingsTab("plugins");
                setSettingsOpen(true);
              },
            },
          });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : String(error));
        }
      }
      if (threadFiles.length > 0) {
        await handleImportFiles(threadFiles, "", workspaceRuntimeIdRef.current);
      }
    },
    [handleImportFiles, workspaceRuntimeIdRef]
  );
  const getActiveThreadForStorage =
    useCallback(async (): Promise<Thread | null> => {
      const target = getActiveShareThread();
      if (!target) return null;
      return createFileSystemClient(target.runtimeId).read(target.path);
    }, [getActiveShareThread]);
  const importFromThreadStorage = useCallback(
    async (thread: Thread) => {
      const runtimeId: RuntimeId = "local";
      if (
        workspaceRuntimeIdRef.current !== runtimeId &&
        !switchWorkspaceRuntime(runtimeId)
      ) {
        throw new Error(
          "Finish active remote runs before importing into the local workspace."
        );
      }
      const fs = createFileSystemClient(runtimeId);
      await fs.mkdir("imported").catch(() => undefined);
      await handleImportFiles(
        [
          {
            name: `${thread.title?.trim() || "imported-thread"}.json`,
            text: JSON.stringify(thread),
          },
        ],
        "imported",
        runtimeId
      );
    },
    [handleImportFiles, switchWorkspaceRuntime, workspaceRuntimeIdRef]
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
      if (!target) return;
      closeTabIfAllowed({
        tracker: runtimeRunTrackerRef.current,
        tabs: tabs.tabs,
        targetId: target,
        onBlocked: () => showRuntimeRunBlocked("closing this tab"),
        commitViews,
        close,
      });
    },
    closeOtherTabs: ({ id, path, runtimeId }) => {
      const targetRuntimeId = runtimeId ?? workspaceRuntimeIdRef.current;
      const target =
        id ??
        (path ? threadTabId(path, targetRuntimeId) : activeTabIdRef.current);
      if (!target) return;
      closeOtherTabsIfAllowed({
        tracker: runtimeRunTrackerRef.current,
        tabs: tabs.tabs,
        keepId: target,
        runtimeId: targetRuntimeId,
        onBlocked: () => showRuntimeRunBlocked("closing other tabs"),
        commitViews,
        closeOthers: closeOthersInRuntime,
      });
    },
    closeAllTabs: () => {
      const runtimeId = workspaceRuntimeIdRef.current;
      closeAllTabsIfAllowed({
        tracker: runtimeRunTrackerRef.current,
        tabs: tabs.tabs,
        runtimeId,
        onBlocked: () => showRuntimeRunBlocked("closing all tabs"),
        commitViews,
        closeAll: closeAllInRuntime,
      });
    },
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
  const refreshReservationsRef = useRef(new Map<string, () => void>());
  const writePluginActiveTabThread = useCallback(
    async (target: PluginActiveTab, next: Thread): Promise<void> => {
      const current = getActivePluginTab();
      if (
        current?.tabId !== target.tabId ||
        current?.paneId !== target.paneId ||
        current?.path !== target.path ||
        current?.runtimeId !== target.runtimeId
      ) {
        throw new Error(
          "The active thread changed before the Plugin Command completed."
        );
      }

      const release = runtimeRunTrackerRef.current.reservePanes([
        target.paneId,
      ]);
      if (!release) {
        throw new Error(
          "Finish the active run or save before a Plugin Command writes the thread."
        );
      }

      try {
        const committed: Thread = {
          ...next,
          runtimeId: target.runtimeId,
        };
        await createFileSystemClient(target.runtimeId).write(
          target.path,
          committed
        );
        threadStateRef.current.set(target.tabId, committed);
        refreshReservationsRef.current.set(target.paneId, release);
        tabs.refresh(target.tabId);
      } catch (error) {
        release();
        throw error;
      }
    },
    [getActivePluginTab, tabs]
  );
  const handleRefreshTab = useCallback(
    (id: string) => {
      const tab = tabs.tabs.find((candidate) => candidate.id === id);
      if (!tab) return;
      const reservation = refreshTabIfAllowed({
        tracker: runtimeRunTrackerRef.current,
        tabs: tabs.tabs,
        targetId: tab.id,
        onBlocked: () => showRuntimeRunBlocked("refreshing this tab"),
        refresh: tabs.refresh,
      });
      if (reservation) {
        refreshReservationsRef.current.set(
          reservation.paneId,
          reservation.release
        );
      }
    },
    [showRuntimeRunBlocked, tabs]
  );
  const handlePaneRefreshSettled = useCallback((paneId: string) => {
    const release = refreshReservationsRef.current.get(paneId);
    if (!release) return;
    refreshReservationsRef.current.delete(paneId);
    release();
  }, []);
  const paneLifecycleHost = useMemo<PaneLifecycleHost>(
    () => ({
      acquireMutation: acquireFileMutation,
      isMutationReserved: isPaneMutationReserved,
      onPersistenceChange: handlePanePersistenceChange,
      onRefreshSettled: handlePaneRefreshSettled,
      onRunSettled: handlePaneRunSettled,
      onRunStart: handlePaneRunStart,
    }),
    [
      acquireFileMutation,
      handlePanePersistenceChange,
      handlePaneRefreshSettled,
      handlePaneRunSettled,
      handlePaneRunStart,
      isPaneMutationReserved,
    ]
  );
  useEffect(
    () => () => {
      refreshReservationsRef.current.forEach((release) => release());
      refreshReservationsRef.current.clear();
    },
    []
  );
  const reconcileFileRemove = useCallback(
    (path: string, runtimeId: RuntimeId) => {
      flushSync(() => handleRemove(path, runtimeId));
    },
    [handleRemove]
  );
  const reconcileFileMove = useCallback(
    (from: string, to: string, runtimeId: RuntimeId) => {
      flushSync(() => handleMove(from, to, runtimeId));
    },
    [handleMove]
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
        setDropKind(droppedFileKind(e.dataTransfer));
        setIsDraggingFiles(true);
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDropKind(droppedFileKind(e.dataTransfer));
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
        void handleDroppedFiles(e.dataTransfer.files);
      }}
    >
      <SharedImportProvider />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".json,.jsonl,application/json,application/x-ndjson"
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
            onResize={handleSidebarResize}
          >
            <FileSystemTreeView
              runtimeId={workspaceRuntimeId}
              className={
                effectiveSidebarMode === "files" ? "min-h-0 flex-1" : "hidden"
              }
              onSelectFile={tabs.open}
              onRemove={reconcileFileRemove}
              onMove={reconcileFileMove}
              acquireMutation={acquireFileMutation}
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
              canDisconnect={canDisconnectRuntime}
              acquireDisconnect={acquireRuntimeDisconnectMutation}
              onDisconnected={commitDisconnectedRuntime}
            />
            <AccountStatus />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel minSize={640}>
            <ThreadTabs
              tabs={visibleTabs}
              paneTabs={tabs.tabs}
              emptyState={
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
              }
              activeId={visibleActiveId}
              activate={activateVisibleTab}
              refresh={handleRefreshTab}
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
              openThread={tabs.open}
              reorder={reorderVisibleTabs}
              onNewFile={handleNewFile}
              onMove={reconcileFileMove}
              onTraceTitleChange={tabs.handleTraceTitleChange}
              onToggleSidebar={handleToggleSidebar}
              lifecycleHost={paneLifecycleHost}
              mutationRevision={mutationRevision}
              commitView={commitView}
              onViewCommitScopeReady={handleViewCommitScopeReady}
              onThreadStateChange={handleThreadStateChange}
              toolbarSlot={<UpdateIndicator />}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
      <FirecrawlLimitDialog />
      <GithubDeviceDialog />
      <GithubStarReminder />
      <FeatureReminderDialog />
      <PageShareThreadController
        workspaceRuntimeId={workspaceRuntimeId}
        getActiveThread={getActiveShareThread}
      />
      <LazyMount open={settingsOpen}>
        <SettingsDialog
          tab={settingsTab}
          selectedPluginId={settingsPluginId}
          open={settingsOpen}
          onOpenChange={handleSettingsOpenChange}
          onTabChange={setSettingsTab}
          canConnectRemote={canConnectRemote}
          canDisconnectRemote={canDisconnectRuntime}
          acquireConnectRemote={acquireRemoteConnectionMutation}
          acquireDisconnectRemote={acquireRuntimeDisconnectMutation}
          onRemoteConnected={(runtimeId) => {
            transitionWorkspaceRuntime(runtimeId);
          }}
          onRemoteDisconnected={commitDisconnectedRuntime}
        />
      </LazyMount>
      <LazyMount open={commandPaletteOpen}>
        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
          blacklist={COMMAND_PALETTE_BLACKLIST}
          onSaveTo={() => setThreadStorageMode("save")}
          onImportFrom={() => setThreadStorageMode("import")}
          getActiveTab={getActivePluginTab}
          writeActiveTabThread={writePluginActiveTabThread}
        />
      </LazyMount>
      <LazyMount open={threadStorageMode !== null}>
        <ThreadStorageDialog
          mode={threadStorageMode ?? "save"}
          open={threadStorageMode !== null}
          onOpenChange={(open) => {
            if (!open) setThreadStorageMode(null);
          }}
          getThread={getActiveThreadForStorage}
          onImported={importFromThreadStorage}
        />
      </LazyMount>
      <LazyMount open={onboardOpen}>
        <OnboardDialog open={onboardOpen} onOpenChange={setOnboardOpen} />
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
        <div className="border-primary bg-primary/10 text-primary pointer-events-none fixed inset-3 z-[100] flex items-center justify-center rounded-lg border-2 border-dashed text-sm font-medium backdrop-blur-sm">
          {dropKind === "plugins"
            ? "Drop plugin ZIP to install"
            : dropKind === "mixed"
              ? "Drop ZIPs to install and files to import"
              : "Drop files to import as threads"}
        </div>
      )}
    </div>
  );
}
