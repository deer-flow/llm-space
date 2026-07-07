"use client";

import type { AgentTransport, Thread } from "@llm-space/core";
import { HistoryIcon, PlayIcon, Redo2Icon, Undo2Icon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePanelRef } from "react-resizable-panels";

import { useRegisterCommands } from "@/commands";
import {
  resolveModelConfig,
  useDefaultModel,
  useFirstAvailableModel,
  useModels,
} from "@/components/model-provider";
import { threadTitleFromPath } from "@/lib/thread-file";
import { cn } from "@/lib/utils";

import { Tooltip } from "../tooltip";
import { Button } from "../ui/button";
import { Kbd, KbdGroup } from "../ui/kbd";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../ui/resizable";
import { Spinner } from "../ui/spinner";
import { Switch } from "../ui/switch";

import { AutoRunApprovalDialog } from "./auto-run-approval-dialog";
import { MessageListView } from "./message/message-list-view";
import { ThreadPlaygroundSkeleton } from "./misc/skeleton";
import { TitleEditor, type TitleValidator } from "./misc/title-editor";
import { ModelConfigEditor } from "./model/model-config-editor";
import { SystemPromptEditor } from "./prompt/system-prompt-editor";
import { RunHistoryListView } from "./run-history-list-view";
import {
  canRedo,
  canUndo,
  createThreadStore,
  isThreadBusy,
  MAX_AUTO_RUN_ROUNDS,
  ThreadStoreContext,
  useThreadStore,
  useThreadStoreActions,
} from "./stores";
import { callThreadTool } from "./tool/call-thread-tool";
import { ToolListView } from "./tool/tool-list-view";
import { useShortcuts } from "./use-shortcuts";
import { useThreadPlaygroundEvents } from "./use-thread-playground-events";

export interface ThreadPlaygroundProps {
  className?: string;
  path: string;
  title?: string;
  headerDetails?: ReactNode;
  initialValue: Thread;
  readonly?: boolean;
  /**
   * Whether this playground belongs to the active tab. Only the active one
   * registers the `runThread` command handler (the command registry keeps a
   * single handler per type), so a global run always targets the active tab.
   */
  active?: boolean;
  /** The streaming transport used by runs (e.g. HTTP or Electrobun RPC). */
  transport?: AgentTransport;

  onChange?: (thread: Thread) => void;
  onRenameTitle?: (title: string) => Promise<boolean>;
  validateTitle?: TitleValidator;
  onStreamingStart?: () => void;
  onStreamingEnd?: () => void;
}

export function ThreadPlayground({
  loading,
  initialValue,
  className,
  ...props
}: Omit<ThreadPlaygroundProps, "initialValue"> & {
  loading?: boolean;
  initialValue?: Thread | null;
}) {
  if (loading) {
    return <ThreadPlaygroundSkeleton className={className} />;
  }
  if (!initialValue) {
    throw new Error("initialValue is required when not loading");
  }
  return (
    <_ThreadPlayground
      className={className}
      initialValue={initialValue}
      {...props}
    />
  );
}

function _ThreadPlayground({
  initialValue,
  transport,
  onChange,
  onStreamingStart,
  onStreamingEnd,
  ...props
}: ThreadPlaygroundProps) {
  // Keep live refs to the provider list and default model so the store can
  // resolve a thread's model (its own, else the default/first available) at
  // run/edit time without being recreated.
  const providers = useModels();
  const providersRef = useRef(providers);
  providersRef.current = providers;
  const defaultModel = useDefaultModel();
  const defaultModelRef = useRef(defaultModel);
  defaultModelRef.current = defaultModel;
  const [store] = useState(() =>
    createThreadStore(initialValue, {
      transport,
      resolveModel: (saved) =>
        resolveModelConfig(
          providersRef.current,
          saved,
          defaultModelRef.current
        ),
      callTool: callThreadTool,
    })
  );
  useThreadPlaygroundEvents(store, {
    onChange,
    onStreamingStart,
    onStreamingEnd,
  });
  // Stop any in-flight run when the playground unmounts (tab closed or
  // refreshed onto a fresh store) — an auto-run episode would otherwise keep
  // chaining model calls and tool executions against the abandoned store.
  useEffect(() => {
    return () => {
      store.getState().abort();
    };
  }, [store]);
  return (
    <ThreadStoreContext.Provider value={store}>
      <ThreadPlaygroundContent {...props} />
    </ThreadStoreContext.Provider>
  );
}

/** Size the Run history panel expands to when toggled open. */
const RUN_HISTORY_PANEL_SIZE = "16rem";

function ThreadPlaygroundContent({
  className,
  path,
  title: titleFromProps,
  headerDetails,
  onRenameTitle,
  validateTitle,
  readonly: readonlyFromProps = false,
  active = false,
}: Omit<
  ThreadPlaygroundProps,
  "initialValue" | "onChange" | "onStreamingStart" | "onStreamingEnd"
>) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Busy spans a whole auto-run episode (round gaps included), not just an
  // in-flight stream — every run/readonly gate below keys off it.
  const busy = useThreadStore(isThreadBusy);
  const runMode = useThreadStore((s) => s.runMode);
  // Presence only — the per-round counter lives in AutoRunRoundIndicator so
  // round bumps don't re-render this whole subtree.
  const hasAutoRun = useThreadStore((s) => s.autoRun !== null);
  const savedModel = useThreadStore((s) => s.thread.model);
  const fallbackModel = useFirstAvailableModel();
  // A thread can run once a model resolves (its own, or the first available).
  const hasModel = Boolean(savedModel ?? fallbackModel);
  const undoable = useThreadStore((s) => canUndo(s.changeHistory));
  const redoable = useThreadStore((s) => canRedo(s.changeHistory));
  const { run, abort, undo, redo, syncTitle, setRunMode } =
    useThreadStoreActions();
  const title = useMemo(
    () => titleFromProps ?? threadTitleFromPath(path),
    [path, titleFromProps]
  );
  useEffect(() => {
    syncTitle(title);
  }, [syncTitle, title]);
  const readonly = useMemo(() => {
    return readonlyFromProps || busy;
  }, [readonlyFromProps, busy]);
  const handleRun = useCallback(async () => {
    await run();
  }, []);
  const handleRunModeChange = useCallback(
    (checked: boolean) => {
      setRunMode(checked ? "auto" : "step");
    },
    [setRunMode]
  );
  // Expose run as a command, but only from the active tab so a global
  // `runThread` targets it (and no-ops when no tab is active). Skip while
  // already running to avoid run()'s "already running" throw.
  useRegisterCommands(
    {
      runThread: () => {
        if (!busy) void run();
      },
    },
    active
  );
  const handleStop = useCallback(() => {
    try {
      abort();
    } catch {
      // Ignored
    }
  }, []);
  const runHistoryPanelRef = usePanelRef();
  const [historyOpen, setHistoryOpen] = useState(false);
  const toggleHistory = useCallback(() => {
    const panel = runHistoryPanelRef.current;
    if (!panel) {
      return;
    }
    if (panel.isCollapsed()) {
      panel.resize(RUN_HISTORY_PANEL_SIZE);
    } else {
      panel.collapse();
    }
  }, [runHistoryPanelRef]);
  const closeHistory = useCallback(() => {
    runHistoryPanelRef.current?.collapse();
  }, []);
  const handleShortcuts = useShortcuts({ readonly: readonlyFromProps });
  return (
    <div
      ref={containerRef}
      className={cn("flex flex-col overflow-hidden", className)}
      tabIndex={0}
      onKeyDownCapture={handleShortcuts}
    >
      <ResizablePanelGroup>
        <ResizablePanel className="flex min-h-0 flex-col overflow-hidden">
          <header
            className={cn(
              "flex w-full shrink-0 items-center border-b",
              headerDetails ? "min-h-14 py-1.5" : "h-12"
            )}
          >
            <div className="min-w-0 grow px-3">
              <TitleEditor
                className="w-96 max-w-full"
                title={title}
                readonly={readonly || !onRenameTitle}
                onRename={onRenameTitle}
                validateTitle={validateTitle}
              />
              {headerDetails ? (
                <div className="mt-0.5 flex min-w-0 items-center">
                  {headerDetails}
                </div>
              ) : null}
            </div>
            <div
              className={cn(
                "flex items-center gap-0.5 px-1",
                readonlyFromProps && "hidden"
              )}
            >
              <Tooltip content="Undo last edit">
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label="Undo last edit"
                  disabled={readonly || !undoable}
                  onClick={undo}
                >
                  <Undo2Icon className="size-4" />
                </Button>
              </Tooltip>
              <Tooltip content="Redo last edit">
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label="Redo last edit"
                  disabled={readonly || !redoable}
                  onClick={redo}
                >
                  <Redo2Icon className="size-4" />
                </Button>
              </Tooltip>
              <Tooltip content="View run history">
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label={
                    historyOpen ? "Hide run history" : "View run history"
                  }
                  aria-expanded={historyOpen}
                  onClick={toggleHistory}
                >
                  <HistoryIcon className="size-4" />
                </Button>
              </Tooltip>
            </div>
            <div className="flex items-center gap-3 px-3">
              <div
                className={cn(
                  "flex items-center",
                  readonlyFromProps && "hidden"
                )}
              >
                {hasAutoRun ? (
                  <AutoRunRoundIndicator />
                ) : (
                  <Tooltip content="Auto-run: call MCP and built-in tools automatically and continue until a final answer">
                    <div className="flex items-center gap-1.5">
                      <Switch
                        size="sm"
                        aria-label="Toggle auto-run"
                        checked={runMode === "auto"}
                        disabled={busy}
                        onCheckedChange={handleRunModeChange}
                      />
                      <span className="text-muted-foreground text-xs">
                        Auto
                      </span>
                    </div>
                  </Tooltip>
                )}
              </div>
              <Tooltip
                content={
                  <div>
                    {busy ? "Stop running" : "Run this thread"}
                    <KbdGroup>
                      <Kbd className="text-foreground!">⌘ Enter</Kbd>
                    </KbdGroup>
                  </div>
                }
              >
                <Button
                  className={cn(
                    "w-20 px-3 py-3.5",
                    readonlyFromProps && "hidden"
                  )}
                  aria-label={busy ? "Stop running thread" : "Run thread"}
                  disabled={readonlyFromProps || (!busy && !hasModel)}
                  onClick={busy ? handleStop : handleRun}
                >
                  {busy ? (
                    <Spinner className="size-3" />
                  ) : (
                    <PlayIcon className="size-3" />
                  )}
                  {busy ? "Stop" : "Run"}
                </Button>
              </Tooltip>
            </div>
          </header>
          <ResizablePanelGroup
            className="flex min-h-0 grow"
            orientation="horizontal"
          >
            <ResizablePanel
              className="px-3 pb-3"
              defaultSize="50%"
              minSize="300px"
            >
              <div className="flex size-full flex-col">
                <div className={"flex w-full border-b py-2"}>
                  <div className="text-muted-foreground w-20 shrink-0 text-sm">
                    Models
                  </div>
                  <div className="flex grow items-center">
                    <ModelConfigEditor readonly={readonly} />
                  </div>
                </div>
                <div className={"flex w-full border-b py-2"}>
                  <div className="text-muted-foreground w-20 shrink-0 text-sm">
                    Tools
                  </div>
                  <div className="flex grow items-center">
                    <ToolListView readonly={readonly} />
                  </div>
                </div>
                <div className="flex min-h-0 w-full grow flex-col">
                  <SystemPromptEditor
                    className="min-h-0 grow"
                    readonly={readonly}
                  />
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle className="opacity-50 hover:opacity-100" />
            <ResizablePanel minSize="300px">
              <MessageListView readonly={readonly} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel
          panelRef={runHistoryPanelRef}
          collapsible
          collapsedSize={0}
          defaultSize={0}
          minSize={RUN_HISTORY_PANEL_SIZE}
          onResize={(size) => {
            setHistoryOpen(size.inPixels > 0);
          }}
        >
          <RunHistoryListView onClose={closeHistory} />
        </ResizablePanel>
      </ResizablePanelGroup>
      <AutoRunApprovalDialog threadTitle={title} />
    </div>
  );
}

/** Isolated so per-round updates don't re-render the whole playground. */
function AutoRunRoundIndicator() {
  const round = useThreadStore((s) => s.autoRun?.round ?? null);
  if (round === null) {
    return null;
  }
  return (
    <span className="text-muted-foreground text-xs tabular-nums">
      Round {round}/{MAX_AUTO_RUN_ROUNDS}
    </span>
  );
}
