import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
  type DroppableProvided,
} from "@hello-pangea/dnd";
import type { AssistantMessage, Message, ThreadContext } from "@llm-space/core";
import { PlusIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@llm-space/ui/lib/utils";
import { Button } from "@llm-space/ui/ui/button";
import { ScrollArea } from "@llm-space/ui/ui/scroll-area";
import { ShineBorder } from "@llm-space/ui/ui/shine-border";

import {
  type RunValidationIssue,
  useThreadStore,
  useThreadStoreActions,
} from "../stores";

import {
  ImageDisplayProvider,
  type ImageDisplayContextValue,
} from "./image-display-context";
import { MessageListItem } from "./message-list-item";

export function MessageListView({
  className,
  context: contextFromProps,
  messages: messagesFromProps,
  readonly: readonlyFromProps = false,
  compactImages = false,
}: {
  className?: string;
  context?: ThreadContext;
  messages?: Message[];
  readonly?: boolean;
  /** Render image attachments as `[Image #N]` placeholders. */
  compactImages?: boolean;
}) {
  const isSnapshotView = messagesFromProps !== undefined;
  const status = useThreadStore((s) => s.status);
  const collapsedMessageIds = useThreadStore((s) => s.collapsedMessageIds);
  const autoFocusMessageId = useThreadStore((s) => s.autoFocusMessageId);
  const runValidationIssue = useThreadStore((s) => s.runValidationIssue);
  const storeMessages = useThreadStore((s) => s.thread.context?.messages);
  const { appendMessage, moveMessage, resolveRunValidationIssue } =
    useThreadStoreActions();
  const [dragging, setDragging] = useState(false);
  const messages = useMemo(
    () => messagesFromProps ?? storeMessages ?? [],
    [messagesFromProps, storeMessages]
  );
  const readonly = useMemo(() => {
    return readonlyFromProps || dragging || isSnapshotView;
  }, [dragging, isSnapshotView, readonlyFromProps]);
  const addMessageSuggested =
    runValidationIssue?.resolution?.type === "appendUserMessage";

  // Number every image attachment sequentially across the thread so the compact
  // placeholder can label it `[Image #N]`.
  const imageDisplay = useMemo<ImageDisplayContextValue>(() => {
    const numbers = new Map<string, number>();
    let count = 0;
    for (const message of messages) {
      message.content.forEach((content, contentIndex) => {
        if (content.type === "image") {
          count += 1;
          numbers.set(`${message.id}:${contentIndex}`, count);
        }
      });
    }
    return {
      compact: compactImages,
      numberOf: (messageId, contentIndex) =>
        numbers.get(`${messageId}:${contentIndex}`) ?? 0,
    };
  }, [messages, compactImages]);

  const handleDragStart = useCallback(() => {
    setDragging(true);
  }, []);
  const handleDragEnd = useCallback(
    (result: DropResult) => {
      setDragging(false);
      const { source, destination } = result;
      if (!destination || source.index === destination.index) return;
      moveMessage(source.index, destination.index);
    },
    [moveMessage]
  );

  const contentRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = useCallback(() => {
    const viewport = contentRef.current?.closest<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    );
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, []);

  // Jump to the latest messages when a run starts so the streaming reply is
  // in view. Fires on the idle → running transition (status only flips here).
  useEffect(() => {
    if (status === "running") {
      scrollToBottom();
    }
  }, [status, scrollToBottom]);

  return (
    <ScrollArea type="auto" className={cn("size-full", className)}>
      <ImageDisplayProvider value={imageDisplay}>
        <div ref={contentRef} className="flex flex-col p-3 pt-0.5">
          {isSnapshotView ? (
            <StaticMessageList
              context={contextFromProps}
              messages={messages}
              readonly={readonly}
            />
          ) : (
            <DragDropContext
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <Droppable droppableId="message-list">
                {(droppableProvided) => (
                  <DroppableMessageList
                    droppableProvided={droppableProvided}
                    messages={messages}
                    readonly={readonly}
                    autoFocusMessageId={autoFocusMessageId}
                    collapsedMessageIds={collapsedMessageIds}
                    runValidationIssue={runValidationIssue}
                  />
                )}
              </Droppable>
            </DragDropContext>
          )}
          {!isSnapshotView && (
            <StreamingMessageListItem streaming={status === "running"} />
          )}
          <div className="relative rounded-lg">
            <Button
              // No top margin: the preceding message / streaming item (or, in the
              // empty state, the list's own top padding) already provides the gap.
              className={cn(
                "text-muted-foreground hover:text-accent-foreground w-full justify-start rounded-lg py-5",
                dragging && "invisible",
                readonly && "hidden"
              )}
              disabled={readonly}
              variant="secondary"
              size="lg"
              onClick={
                addMessageSuggested ? resolveRunValidationIssue : appendMessage
              }
            >
              <PlusIcon className="size-4" />
              Add message
            </Button>
            {addMessageSuggested && !dragging && !readonly ? (
              <>
                <ShineBorder
                  borderWidth={1}
                  duration={14}
                  shineColor="var(--primary)"
                />
                <ShineBorder
                  borderWidth={1}
                  duration={14}
                  shineColor="var(--primary)"
                  style={{ animationDelay: "-7s" }}
                />
              </>
            ) : null}
          </div>
        </div>
      </ImageDisplayProvider>
    </ScrollArea>
  );
}

function StaticMessageList({
  context,
  messages,
  readonly,
}: {
  context?: ThreadContext;
  messages: Message[];
  readonly: boolean;
}) {
  return (
    <div className="flex flex-col pt-3">
      {messages.map((message) => (
        <MessageListItem
          key={message.id}
          className="mb-3.5"
          context={context}
          message={message}
          readonly={readonly}
        />
      ))}
    </div>
  );
}

function DroppableMessageList({
  droppableProvided,
  messages,
  readonly,
  autoFocusMessageId,
  collapsedMessageIds,
  runValidationIssue,
}: {
  droppableProvided: DroppableProvided;
  messages: Message[];
  readonly: boolean;
  autoFocusMessageId: string | null;
  collapsedMessageIds: string[];
  runValidationIssue: RunValidationIssue | null;
}) {
  return (
    <div
      className="flex flex-col pt-3"
      ref={droppableProvided.innerRef}
      {...droppableProvided.droppableProps}
    >
      {messages.map((message, index) => (
        <DraggableMessageRow
          key={message.id}
          message={message}
          index={index}
          readonly={readonly}
          autoFocus={message.id === autoFocusMessageId}
          collapsed={collapsedMessageIds.includes(message.id)}
          runValidationIssue={
            message.id === runValidationIssue?.messageId
              ? runValidationIssue
              : null
          }
        />
      ))}
      {droppableProvided.placeholder}
    </div>
  );
}

// One draggable row. The `memo` boundary sits *above* the `<Draggable>` (not
// inside its render prop) so that editing one message doesn't re-render every
// row: @hello-pangea/dnd hands the render prop a fresh `draggableProvided` (with
// a new `dragHandleProps` object) on every parent render, which would defeat a
// memo placed on MessageListItem alone. With only stable data props here, the
// rows whose message/flags are unchanged bail — their `Draggable` and
// MessageListItem never re-render. Drags still work: the dragging/displaced rows
// re-render via the dnd store subscription inside `Draggable`, not via props.
const _DraggableMessageRow = function DraggableMessageRow({
  message,
  index,
  readonly,
  autoFocus,
  collapsed,
  runValidationIssue,
}: {
  message: Message;
  index: number;
  readonly: boolean;
  autoFocus: boolean;
  collapsed: boolean;
  runValidationIssue: RunValidationIssue | null;
}) {
  return (
    <Draggable draggableId={message.id} index={index} isDragDisabled={readonly}>
      {(draggableProvided) => {
        const { style, ...draggableProps } = draggableProvided.draggableProps;
        return (
          <div
            ref={draggableProvided.innerRef}
            {...draggableProps}
            // Spacing lives on the draggable as a margin (not a flex `gap` on the
            // list) because @hello-pangea/dnd measures item margins to size the
            // placeholder and compute drag displacement — a `gap` is invisible to
            // it and offsets every item mid-drag.
            className="mb-3.5"
            style={style}
          >
            <MessageListItem
              message={message}
              readonly={readonly}
              autoFocus={autoFocus}
              collapsed={collapsed}
              runValidationIssue={runValidationIssue}
              dragHandleProps={draggableProvided.dragHandleProps}
            />
          </div>
        );
      }}
    </Draggable>
  );
};
const DraggableMessageRow = memo(_DraggableMessageRow);

function StreamingMessageListItem({ streaming }: { streaming: boolean }) {
  let streamingMessage: AssistantMessage | null = useThreadStore(
    (s) => s.streamingMessage
  );
  if (!streamingMessage && streaming) {
    streamingMessage ??= {
      id: "streaming",
      role: "assistant",
      content: [],
    };
  }
  if (!streamingMessage) {
    return null;
  }
  return (
    <MessageListItem
      className="mb-3.5"
      message={streamingMessage}
      readonly
      streaming
    />
  );
}
