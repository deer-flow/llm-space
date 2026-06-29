"use client";

import type { Thread } from "@llm-space/core";
import { HistoryIcon, PlayIcon, Redo2Icon, Undo2Icon } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { usePanelRef } from "react-resizable-panels";

import { cn } from "@/lib/utils";
import { canRedo, canUndo } from "@/stores/thread-history";
import {
  createThreadStore,
  ThreadStoreContext,
  useThreadStore,
  useThreadStoreActions,
} from "@/stores/thread-store";

import { Tooltip } from "../tooltip";
import { Button } from "../ui/button";
import { Kbd, KbdGroup } from "../ui/kbd";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../ui/resizable";
import { Spinner } from "../ui/spinner";

import { MessageListView } from "./message/message-list-view";
import { ThreadPlaygroundSkeleton } from "./misc/skeleton";
import { TitleEditor } from "./misc/title-editor";
import { ModelConfigEditor } from "./model/model-config-editor";
import { SystemPromptEditor } from "./prompt/system-prompt-editor";
import { RunHistoryListView } from "./run-history-list-view";
import { ToolListView } from "./tool/tool-list-view";
import { useShortcuts } from "./use-shortcuts";
import { useThreadPlaygroundEvents } from "./use-thread-playground-events";

export interface ThreadPlaygroundProps {
  className?: string;
  initialValue: Thread;
  readonly?: boolean;

  onChange?: (thread: Thread) => void;
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
  onChange,
  onStreamingStart,
  onStreamingEnd,
  ...props
}: ThreadPlaygroundProps) {
  const [store] = useState(() => createThreadStore(initialValue));
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
  readonly: readonlyFromProps = false,
}: Omit<
  ThreadPlaygroundProps,
  "initialValue" | "onChange" | "onStreamingStart" | "onStreamingEnd"
>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const status = useThreadStore((s) => s.status);
  const undoable = useThreadStore((s) => canUndo(s.changeHistory));
  const redoable = useThreadStore((s) => canRedo(s.changeHistory));
  const { run, abort, undo, redo } = useThreadStoreActions();
  const readonly = useMemo(() => {
    return readonlyFromProps || status === "running";
  }, [readonlyFromProps, status]);
  const handleRun = useCallback(async () => {
    await run();
  }, []);
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
          <header className="flex h-12 w-full shrink-0 items-center border-b">
            <div className="min-w-0 grow px-3">
              <TitleEditor className="w-96 max-w-full" readonly={readonly} />
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
                  disabled={readonly || !redoable}
                  onClick={redo}
                >
                  <Redo2Icon className="size-4" />
                </Button>
              </Tooltip>
              <Tooltip content="Run history">
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-expanded={historyOpen}
                  onClick={toggleHistory}
                >
                  <HistoryIcon className="size-4" />
                </Button>
              </Tooltip>
            </div>
            <div className="flex items-center px-3">
              <Tooltip
                content={
                  <div>
                    {status === "running"
                      ? "Stop the running thread "
                      : "Run the thread "}
                    <KbdGroup>
                      <Kbd>⌘ Enter</Kbd>
                    </KbdGroup>
                  </div>
                }
              >
                <Button
                  className={cn(
                    "w-20 px-3 py-3.5",
                    readonlyFromProps && "hidden"
                  )}
                  disabled={readonlyFromProps}
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
                  <div className="text-muted-foreground shrink-0 py-2 text-sm">
                    System prompt
                  </div>
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
          minSize={200}
          onResize={(size) => {
            setHistoryOpen(size.inPixels > 0);
          }}
        >
          <RunHistoryListView />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
