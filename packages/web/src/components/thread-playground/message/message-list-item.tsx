import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import type { ImageDataContent, Message } from "@llm-space/core";
import { PlusIcon } from "lucide-react";
import { memo, useCallback, useMemo } from "react";

import { CodeEditor } from "@/components/code-editor";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { CollapsibleContent } from "@/components/ui/collapsible-content";
import { ShineBorder } from "@/components/ui/shine-border";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useThreadStoreActions } from "@/stores/thread-store";

import { ImageContentList } from "./image-content-view";
import { MessageListItemHeader } from "./message-list-item-header";
import { ThinkingView } from "./thinking-view";
import { ToolCallListItem } from "./tool-call-list-item";

function _MessageListItem({
  className,
  message,
  placeholder,
  readonly = false,
  streaming,
  collapsed,
  dragHandleProps,
}: {
  className?: string;
  message: Message;
  placeholder?: string;
  readonly?: boolean;
  streaming?: boolean;
  collapsed?: boolean;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
}) {
  const text = useMemo(() => {
    const result: string[] = [];
    for (const c of message.content) {
      if (c.type === "text") {
        result.push(c.text);
      }
    }
    return result.join("\n");
  }, [message.content]);
  const imageContents = useMemo(() => {
    const result: { content: ImageDataContent; contentIndex: number }[] = [];
    message.content.forEach((content, contentIndex) => {
      if (content.type === "image_data") {
        result.push({ content, contentIndex });
      }
    });
    return result;
  }, [message.content]);
  const {
    addMessageImageContent,
    insertMessageBefore,
    run,
    updateMessageTextContent,
  } = useThreadStoreActions();
  const handleRun = useCallback(async () => {
    await run(message.id);
  }, [run, message.id]);
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
        "bg-(--textarea) hover:border-accent-foreground/20 focus-within:border-ring! group relative flex size-full flex-col items-center rounded-lg border transition-[padding-bottom,border-color]",
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
        <div className="insert-line absolute left-0 right-2 top-1.5 border-b border-dashed opacity-0 transition-[opacity,border-color,border-style] group-hover:opacity-100"></div>
        <Tooltip content="Insert message here">
          <Button
            className="text-muted-foreground hover:border-primary hover:bg-primary! hover:text-primary-foreground absolute -right-3 -top-0.5 z-10 size-4 rounded-full opacity-0 transition-[opacity,background-color,color,border-color] group-hover:opacity-100"
            variant="outline"
            size="icon-xs"
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
          borderWidth={2}
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
              className="min-h-9.5 max-h-[40vh] w-full"
              autoFocus
              hideFocusRing
              hideBorder
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
          {message.role === "assistant" && message.toolCalls && (
            <div className="mb-3 flex w-full flex-col gap-3 px-3">
              {message.toolCalls.map((toolCall) => (
                <ToolCallListItem
                  key={toolCall.id}
                  messageId={message.id}
                  toolCall={toolCall}
                />
              ))}
            </div>
          )}
        </main>
      </CollapsibleContent>
    </div>
  );
}

function StreamingMessageSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("px-1 pb-3", className)}>
      <div className="px-1.5">
        <Skeleton className="h-3 w-[33%] rounded" />
      </div>
      <div className="px-1 pt-3">
        <Skeleton className="animate-skeleton-extending delay-750 h-4 w-[90%] rounded" />
      </div>
    </div>
  );
}

export const MessageListItem = memo(_MessageListItem);
