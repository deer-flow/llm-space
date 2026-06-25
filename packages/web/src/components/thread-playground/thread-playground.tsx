"use client";

import type { Thread } from "@llm-space/core";
import { PlayIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import {
  createThreadStore,
  ThreadStoreContext,
  useThreadStore,
  useThreadStoreActions,
} from "@/stores/thread-store";

import { Tooltip } from "../tooltip";
import { Button } from "../ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../ui/resizable";
import { Spinner } from "../ui/spinner";

import { MessageListView } from "./message/message-list-view";
import { TitleEditor } from "./misc/title-editor";
import { ModelConfigEditor } from "./model/model-config-editor";
import { SystemPromptEditor } from "./prompt/system-prompt-editor";
import { ToolListView } from "./tool/tool-list-view";

export interface ThreadPlaygroundProps {
  className?: string;
  initialThread?: Thread;
  readonly?: boolean;
}

function ThreadPlaygroundContent({
  className,
  readonly: readonlyFromProps = false,
}: Omit<ThreadPlaygroundProps, "initialThread">) {
  const status = useThreadStore((s) => s.status);
  const { run, abort } = useThreadStoreActions();
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
  return (
    <div className={cn("flex flex-col overflow-hidden", className)}>
      <header className="flex h-12 w-full shrink-0 items-center border-b">
        <div className="min-w-0 grow px-3">
          <TitleEditor className="w-96 max-w-full" readonly={readonly} />
        </div>
        <div className="px-3">
          <Tooltip
            content={
              status === "running"
                ? "Stop the running thread"
                : "Run the thread"
            }
          >
            <Button
              className={cn("w-20 px-3 py-4", readonlyFromProps && "hidden")}
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
        <ResizablePanel className="px-3 pb-3" defaultSize="50%" minSize="300px">
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
    </div>
  );
}

export function ThreadPlayground({
  initialThread = _createBlankThread(),
  ...props
}: ThreadPlaygroundProps) {
  const [store] = useState(() => createThreadStore(initialThread));
  return (
    <ThreadStoreContext.Provider value={store}>
      <ThreadPlaygroundContent {...props} />
    </ThreadStoreContext.Provider>
  );
}

function _createBlankThread(): Thread {
  return {
    model: {
      provider: "deepseek",
      id: "deepseek-v4-flash",
    },
  };
}
