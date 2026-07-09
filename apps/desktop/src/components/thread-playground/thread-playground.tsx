"use client";

import type { AgentTransport, Thread } from "@llm-space/core";
import {
  ChevronDownIcon,
  HistoryIcon,
  PlayIcon,
  Redo2Icon,
  Undo2Icon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePanelRef } from "react-resizable-panels";

import { executeTool } from "@/client/tool-execution";
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
import { ButtonGroup } from "../ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Kbd, KbdGroup } from "../ui/kbd";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../ui/resizable";
import { Spinner } from "../ui/spinner";
import { Switch } from "../ui/switch";

import { MessageListView } from "./message/message-list-view";
import { ThreadPlaygroundSkeleton } from "./misc/skeleton";
import { TitleEditor, type TitleValidator } from "./misc/title-editor";
import { ModelConfigEditor } from "./model/model-config-editor";
import { PromptVariablesListView } from "./prompt/prompt-variables-list-view";
import { SystemPromptEditor } from "./prompt/system-prompt-editor";
import { RunHistoryListView } from "./run-history-list-view";
import {
  canRedo,
  canUndo,
  createThreadStore,
  getAutoRunTools,
  getReactLoop,
  ThreadStoreContext,
  useRunMode,
  useThreadStore,
  useThreadStoreActions,
} from "./stores";
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
      getAutoRunTools,
      getReactLoop,
      executeTool,
    })
  );
  useThreadPlaygroundEvents(store, {
    onChange,
    onStreamingStart,
    onStreamingEnd,
  });
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
  const status = useThreadStore((s) => s.status);
  const savedModel = useThreadStore((s) => s.thread.model);
  const fallbackModel = useFirstAvailableModel();
  // A thread can run once a model resolves (its own, or the first available).
  const hasModel = Boolean(savedModel ?? fallbackModel);
  const undoable = useThreadStore((s) => canUndo(s.changeHistory));
  const redoable = useThreadStore((s) => canRedo(s.changeHistory));
  const { effectiveAutoRunTools, reactLoop, setAutoRunTools, setReactLoop } =
    useRunMode();
  const { run, abort, undo, redo, syncTitle } = useThreadStoreActions();
  const [systemPromptStreaming, setSystemPromptStreaming] = useState(false);
  const title = useMemo(
    () => titleFromProps ?? threadTitleFromPath(path),
    [path, titleFromProps]
  );
  useEffect(() => {
    syncTitle(title);
  }, [syncTitle, title]);
  const readonly = useMemo(() => {
    return readonlyFromProps || status === "running";
  }, [readonlyFromProps, status]);
  const handleRun = useCallback(async () => {
    await run();
  }, []);
  // Expose run as a command, but only from the active tab so a global
  // `runThread` targets it (and no-ops when no tab is active). Skip while
  // already running to avoid run()'s "already running" throw.
  useRegisterCommands(
    {
      runThread: () => {
        if (status !== "running") void run();
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
            <div className="flex items-center px-3">
              <ButtonGroup
                className={cn(
                  "transition-transform active:translate-y-px",
                  readonlyFromProps && "hidden"
                )}
              >
                <Tooltip
                  content={
                    <div>
                      {status === "running"
                        ? "Stop running"
                        : "Run this thread"}
                      <KbdGroup>
                        <Kbd className="text-foreground!">⌘ Enter</Kbd>
                      </KbdGroup>
                    </div>
                  }
                >
                  <Button
                    className="border-r-primary border-none pr-1 pl-4 active:translate-y-0!"
                    aria-label={
                      status === "running"
                        ? "Stop running thread"
                        : "Run thread"
                    }
                    disabled={
                      readonlyFromProps || (status !== "running" && !hasModel)
                    }
                    onClick={status === "running" ? handleStop : handleRun}
                  >
                    {status === "running" ? (
                      <Spinner className="size-3" />
                    ) : (
                      <PlayIcon className="size-3" />
                    )}
                    {status === "running" ? "Stop" : "Run"}
                  </Button>
                </Tooltip>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="border-none pr-1.5 pl-0.5 active:translate-y-0!"
                      aria-label="Run settings"
                      disabled={
                        readonlyFromProps || (status !== "running" && !hasModel)
                      }
                    >
                      <ChevronDownIcon className="size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-56">
                    <DropdownMenuLabel>Run settings</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        setReactLoop(!reactLoop);
                      }}
                      className="justify-between gap-6"
                    >
                      Enable ReAct loop
                      <Switch
                        size="sm"
                        checked={reactLoop}
                        className="pointer-events-none"
                      />
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      // The ReAct loop implies auto-running tools, so this row
                      // is forced on and locked while the loop is enabled.
                      disabled={reactLoop}
                      onSelect={(event) => {
                        // Keep the menu open so the switch toggles in place.
                        event.preventDefault();
                        setAutoRunTools(!effectiveAutoRunTools);
                      }}
                      className="justify-between gap-6"
                    >
                      Auto run tools
                      <Switch
                        size="sm"
                        checked={effectiveAutoRunTools}
                        disabled={reactLoop}
                        className="pointer-events-none"
                      />
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </ButtonGroup>
            </div>
          </header>
          <ResizablePanelGroup
            className="flex min-h-0 grow"
            orientation="horizontal"
          >
            <ResizablePanel className="pb-3" defaultSize="50%" minSize="300px">
              <div className="flex size-full flex-col">
                <div className="px-3">
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
                  <div className={"flex w-full border-b py-2"}>
                    <div className="text-muted-foreground w-20 shrink-0 text-sm">
                      Variables
                    </div>
                    <div className="flex grow items-center">
                      <PromptVariablesListView
                        disabled={readonly || systemPromptStreaming}
                        active={active}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex min-h-0 w-full grow flex-col">
                  <SystemPromptEditor
                    className="size-full min-h-0 px-3"
                    readonly={readonly}
                    onStreamingChange={setSystemPromptStreaming}
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
    </div>
  );
}
