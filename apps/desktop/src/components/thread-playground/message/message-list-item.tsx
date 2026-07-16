import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import {
  getMessageText,
  isExecutableTool,
  type ImageDataContent,
  type Message,
  type ThreadContext,
  type ToolCall,
} from "@llm-space/core";
import { createMessagePromptVariablePlaceKey } from "@llm-space/core/thread";
import { PlusIcon } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { openFirecrawlLimitDialog } from "@/components/firecrawl-limit-dialog";
import { useRenderingFidelity } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

import { CodeEditor } from "../../code-editor";
import { Tooltip } from "../../tooltip";
import { Button } from "../../ui/button";
import { CollapsibleContent } from "../../ui/collapsible-content";
import { Marker, MarkerContent } from "../../ui/marker";
import { ShineBorder } from "../../ui/shine-border";
import { Skeleton } from "../../ui/skeleton";
import { useThreadStore, useThreadStoreActions } from "../stores";
import { usePromptVariableExtensionForContext } from "../variable/use-prompt-variable-extension";

import { ImageContentList } from "./image-content-view";
import { MessageListItemHeader } from "./message-list-item-header";
import { ThinkingView } from "./thinking-view";
import { ToolCallListItem } from "./tool-call-list-item";
import { summarizeToolCalls } from "./tool-call-status";
import { useToolCallRunner } from "./use-tool-call-runner";

function _MessageListItem({
  className,
  context,
  message,
  placeholder,
  readonly = false,
  streaming,
  collapsed,
  autoFocus = false,
  dragHandleProps,
}: {
  className?: string;
  context?: ThreadContext;
  message: Message;
  placeholder?: string;
  readonly?: boolean;
  streaming?: boolean;
  collapsed?: boolean;
  /** Focus this message's editor on mount. Set only for a freshly-added message. */
  autoFocus?: boolean;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
}) {
  const { fidelity } = useRenderingFidelity();
  const variableExtension = usePromptVariableExtensionForContext(
    createMessagePromptVariablePlaceKey(message.id),
    context
  );
  const text = useMemo(() => getMessageText(message), [message]);
  const imageContents = useMemo(() => {
    const result: { content: ImageDataContent; contentIndex: number }[] = [];
    // Assistant messages must not display images.
    if (message.role === "assistant") {
      return result;
    }
    message.content.forEach((content, contentIndex) => {
      if (content.type === "image_data") {
        result.push({ content, contentIndex });
      }
    });
    return result;
  }, [message.content, message.role]);
  const toolCallSummary = useMemo(
    () =>
      message.role === "assistant" && message.toolCalls?.length
        ? summarizeToolCalls(message.toolCalls)
        : null,
    [message]
  );
  const toolCallsOnlyBody = useMemo(
    () =>
      message.role === "assistant" &&
      !message.thinking &&
      message.content.length === 0 &&
      (message.toolCalls?.length ?? 0) > 0,
    [message]
  );
  const {
    addMessageImageContent,
    insertMessageBefore,
    run,
    updateMessageTextContent,
  } = useThreadStoreActions();
  const handleRun = useCallback(async () => {
    if (readonly) {
      return;
    }
    await run(message.id);
  }, [message.id, readonly, run]);
  const handleContinue = useCallback(() => {
    void handleRun();
  }, [handleRun]);
  const handleTextContentChange = useCallback(
    (value: string) => {
      updateMessageTextContent(message.id, value);
    },
    [updateMessageTextContent, message.id]
  );
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (message.role !== "user") {
        return;
      }
      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) {
        return;
      }
      for (const item of clipboardItems) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          e.stopPropagation();
          const file = item.getAsFile();
          if (!file) {
            continue;
          }
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
            const [, mimeType, data] = match ?? [];
            if (mimeType && data) {
              addMessageImageContent(message.id, mimeType, data);
            }
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    },
    [addMessageImageContent, message.id, message.role]
  );
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && e.metaKey) {
        void handleRun();
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [handleRun]
  );
  return (
    <div
      className={cn(
        "hover:border-accent-foreground/20 focus-within:border-ring! group group/message relative flex size-full flex-col items-center rounded-lg border bg-(--textarea) transition-[padding-bottom,border-color]",
        collapsed && "pb-2.5",
        className
      )}
    >
      <div
        className={cn(
          "transition-border group absolute -top-3.5 flex h-3 w-full shrink-0",
          "has-[button:hover]:[&>.insert-line]:border-primary has-[button:hover]:[&>.insert-line]:right-0",
          readonly && "invisible"
        )}
      >
        <div className="insert-line absolute top-1.5 right-2 left-0 border-b border-dashed opacity-0 transition-[opacity,border-color,border-style] group-hover:opacity-100"></div>
        <Tooltip content="Insert Message Here">
          <Button
            className="text-muted-foreground hover:border-primary hover:bg-primary! hover:text-primary-foreground absolute -top-0.5 -right-3 z-10 size-4 rounded-full opacity-0 transition-[opacity,background-color,color,border-color] group-hover:opacity-100"
            variant="outline"
            size="icon-xs"
            aria-label="Insert message before this message"
            onClick={() => insertMessageBefore(message.id)}
          >
            <PlusIcon className="size-3" />
          </Button>
        </Tooltip>
      </div>
      {streaming && fidelity !== "lite" && (
        <ShineBorder
          shineColor={["#A07CFE", "#FE8FB5", "#FFBE7B"]}
          duration={8}
          borderWidth={3}
        />
      )}
      <MessageListItemHeader
        className={toolCallsOnlyBody ? "pb-2" : undefined}
        message={message}
        readonly={readonly}
        collapsed={collapsed}
        dragHandleProps={dragHandleProps}
      />
      <CollapsibleContent collapsed={collapsed}>
        <main className="flex w-full flex-col">
          {message.role === "assistant" &&
            streaming &&
            !message.thinking &&
            message.content.length === 0 &&
            (!message.toolCalls || message.toolCalls.length === 0) && (
              <StreamingMessageSkeleton className="mt-2" />
            )}
          {message.role === "assistant" && message.thinking && (
            <ThinkingView className="mt-2" thinking={message.thinking} />
          )}
          <ImageContentList
            messageId={message.id}
            images={imageContents}
            readonly={readonly}
          />
          {message.content.length > 0 && (
            <CodeEditor
              className="max-h-[40vh] min-h-9.5 w-full bg-transparent"
              autoFocus={autoFocus}
              hideFocusRing
              hideBorder
              scrollOnFocus
              plain={fidelity === "lite"}
              placeholder={
                placeholder ??
                `Enter ${message.role === "user" ? "user" : "assistant"} message here`
              }
              streaming={streaming}
              readonly={readonly}
              value={text}
              extraExtensions={variableExtension}
              onChange={handleTextContentChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
            />
          )}
          {message.role === "assistant" &&
            message.toolCalls &&
            message.toolCalls.length > 0 && (
              <div className="flex w-full flex-col gap-3 px-2 pb-2">
                {message.toolCalls.map((toolCall) => (
                  <ToolCallListItem
                    key={toolCall.id}
                    context={context}
                    messageId={message.id}
                    canContinue={toolCallSummary?.canContinue ?? false}
                    onContinue={handleContinue}
                    readonly={readonly}
                    toolCall={toolCall}
                  />
                ))}
                <ToolStepContinuation
                  messageId={message.id}
                  readonly={readonly}
                  toolCalls={message.toolCalls}
                />
              </div>
            )}
        </main>
      </CollapsibleContent>
    </div>
  );
}

function _ToolStepContinuation({
  messageId,
  toolCalls,
  readonly,
}: {
  messageId: string;
  toolCalls: ToolCall[];
  readonly?: boolean;
}) {
  const status = useThreadStore((state) => state.status);
  const { run } = useThreadStoreActions();
  const { resolveTool, runToolCall } = useToolCallRunner(messageId);
  const callableToolCalls = useMemo(
    () =>
      toolCalls.filter((toolCall) => {
        const tool = resolveTool(toolCall.input.name);
        return tool !== undefined && isExecutableTool(tool);
      }),
    [toolCalls, resolveTool]
  );
  const [callingTools, setCallingTools] = useState(false);
  const canCallTools =
    !readonly &&
    status !== "running" &&
    !callingTools &&
    callableToolCalls.length > 0;
  // "Continue" runs the thread from this message (continuing past the tool
  // results), mirroring the header's run action — enabled only once every tool
  // call has a response.
  const canContinue =
    !readonly &&
    status !== "running" &&
    !callingTools &&
    summarizeToolCalls(toolCalls).canContinue;
  const handleContinue = useCallback(async () => {
    if (!canContinue) {
      return;
    }
    await run(messageId);
  }, [canContinue, run, messageId]);
  const handleCallTools = useCallback(async () => {
    if (!canCallTools) {
      return;
    }
    setCallingTools(true);
    try {
      const outcomes = await Promise.all(
        callableToolCalls.map((toolCall) => runToolCall(toolCall))
      );
      let errorCount = 0;
      let firecrawlLimitCount = 0;
      for (const outcome of outcomes) {
        if (outcome?.isError) {
          errorCount += 1;
          if (outcome.isFirecrawlLimit) {
            firecrawlLimitCount += 1;
          }
        }
      }
      if (firecrawlLimitCount > 0) {
        openFirecrawlLimitDialog();
      }
      // Suppress the generic toast when the only failures are the Firecrawl
      // limit, since the dialog already explains them.
      if (errorCount > firecrawlLimitCount) {
        toast.error("Some tool calls failed", {
          description: `${errorCount}/${outcomes.length} tool call${
            outcomes.length === 1 ? "" : "s"
          } failed.`,
        });
      }
    } finally {
      setCallingTools(false);
    }
  }, [callableToolCalls, canCallTools, runToolCall]);

  return (
    <div className="bg-foreground/4 flex min-w-0 items-center justify-between gap-3 rounded-md px-3 py-1">
      <Marker role="status" className="min-w-0">
        <MarkerContent className="truncate text-xs">
          {toolCalls.length} tool call{toolCalls.length === 1 ? "" : "s"}
        </MarkerContent>
      </Marker>
      <div className="flex shrink-0 items-center gap-2">
        {callableToolCalls.length > 0 ? (
          <Button
            className="invisible shrink-0 group-hover/message:visible"
            size="sm"
            variant="outline"
            disabled={!canCallTools}
            aria-label="Call available MCP and built-in tools"
            onClick={() => void handleCallTools()}
          >
            Call tools
          </Button>
        ) : null}
        <Tooltip content="Run from this message">
          <Button
            className="invisible shrink-0 group-hover/message:visible"
            size="sm"
            variant="default"
            disabled={!canContinue}
            aria-label="Run from this message"
            onClick={() => void handleContinue()}
          >
            Continue
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
const ToolStepContinuation = memo(_ToolStepContinuation);

function StreamingMessageSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("px-1 pb-3", className)}>
      <div className="px-1.5">
        <Skeleton className="h-3 w-[33%] rounded" />
      </div>
      <div className="px-1 pt-3">
        <Skeleton className="animate-skeleton-extending h-4 w-[90%] rounded delay-750" />
      </div>
    </div>
  );
}

export const MessageListItem = memo(_MessageListItem);
