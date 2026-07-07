import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import {
  getMessageText,
  type ImageDataContent,
  type Message,
  type ToolCall,
} from "@llm-space/core";
import {
  AlertCircleIcon,
  CheckCircle2,
  Clock4,
  PlayCircleIcon,
  PlusIcon,
} from "lucide-react";
import { memo, useCallback, useMemo } from "react";

import { useRenderingFidelity } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

import { CodeEditor } from "../../code-editor";
import { Tooltip } from "../../tooltip";
import { Button } from "../../ui/button";
import { CollapsibleContent } from "../../ui/collapsible-content";
import { Marker, MarkerContent, MarkerIcon } from "../../ui/marker";
import { ShineBorder } from "../../ui/shine-border";
import { Skeleton } from "../../ui/skeleton";
import { useThreadStore, useThreadStoreActions } from "../stores";

import { ImageContentList } from "./image-content-view";
import { MessageListItemHeader } from "./message-list-item-header";
import { ThinkingView } from "./thinking-view";
import { ToolCallListItem } from "./tool-call-list-item";
import { summarizeToolCalls } from "./tool-call-status";

function _MessageListItem({
  className,
  message,
  placeholder,
  readonly = false,
  streaming,
  collapsed,
  autoFocus = false,
  dragHandleProps,
}: {
  className?: string;
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
  const text = useMemo(() => getMessageText(message), [message]);
  const imageContents = useMemo(() => {
    const result: { content: ImageDataContent; contentIndex: number }[] = [];
    message.content.forEach((content, contentIndex) => {
      if (content.type === "image_data") {
        result.push({ content, contentIndex });
      }
    });
    return result;
  }, [message.content]);
  const toolCallSummary = useMemo(
    () =>
      message.role === "assistant" && message.toolCalls?.length
        ? summarizeToolCalls(message.toolCalls)
        : null,
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
        "hover:border-accent-foreground/20 focus-within:border-ring! group relative flex size-full flex-col items-center rounded-lg border bg-(--textarea) transition-[padding-bottom,border-color]",
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
      {streaming && (
        <ShineBorder
          shineColor={["#A07CFE", "#FE8FB5", "#FFBE7B"]}
          duration={8}
          borderWidth={3}
        />
      )}
      <MessageListItemHeader
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
                    messageId={message.id}
                    canContinue={toolCallSummary?.canContinue ?? false}
                    onContinue={handleContinue}
                    readonly={readonly}
                    toolCall={toolCall}
                  />
                ))}
                <ToolStepContinuation
                  readonly={readonly}
                  toolCalls={message.toolCalls}
                  onContinue={handleContinue}
                />
              </div>
            )}
        </main>
      </CollapsibleContent>
    </div>
  );
}

function _ToolStepContinuation({
  toolCalls,
  readonly,
  onContinue,
}: {
  toolCalls: ToolCall[];
  readonly?: boolean;
  onContinue: () => void;
}) {
  const status = useThreadStore((state) => state.status);
  const summary = useMemo(() => summarizeToolCalls(toolCalls), [toolCalls]);
  const disabled = readonly || status === "running" || !summary.canContinue;
  const readyCount = summary.readyCount + summary.errorCount;
  const missingLabel =
    summary.needsResponseCount === 1
      ? "1 needs response"
      : `${summary.needsResponseCount} need responses`;
  const statusLabel = summary.canContinue
    ? summary.errorCount > 0
      ? `${readyCount}/${summary.totalCount} supplied · ${summary.errorCount} ${
          summary.errorCount === 1 ? "error" : "errors"
        }`
      : `${readyCount}/${summary.totalCount} supplied`
    : missingLabel;

  return (
    <div className="bg-foreground/4 flex min-w-0 items-center justify-between gap-3 rounded-md px-3 py-1">
      <Marker role="status" className="min-w-0">
        <MarkerIcon className="size-3">
          {summary.canContinue ? (
            summary.errorCount > 0 ? (
              <AlertCircleIcon className="size-3 text-red-500" />
            ) : (
              <CheckCircle2 className="size-3 text-green-500" />
            )
          ) : (
            <Clock4 />
          )}
        </MarkerIcon>
        <MarkerContent className="truncate text-xs">
          {summary.canContinue ? "Tool results ready" : "Waiting for tools"} ·{" "}
          {statusLabel}
        </MarkerContent>
      </Marker>
      <Button
        className="shrink-0"
        size="sm"
        variant={summary.canContinue ? "default" : "secondary"}
        disabled={disabled}
        aria-label={
          summary.canContinue
            ? "Continue from tool results"
            : "Continue after tool responses are filled"
        }
        onClick={onContinue}
      >
        <PlayCircleIcon />
        Run
      </Button>
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
