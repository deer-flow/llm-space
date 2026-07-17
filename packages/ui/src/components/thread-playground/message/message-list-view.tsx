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

import { useThreadStore, useThreadStoreActions } from "../stores";

import { MessageListItem } from "./message-list-item";

export function MessageListView({
  className,
  context: contextFromProps,
  messages: messagesFromProps,
  readonly: readonlyFromProps = false,
}: {
  className?: string;
  context?: ThreadContext;
  messages?: Message[];
  readonly?: boolean;
}) {
  const isSnapshotView = messagesFromProps !== undefined;
  const status = useThreadStore((s) => s.status);
  const collapsedMessageIds = useThreadStore((s) => s.collapsedMessageIds);
  const autoFocusMessageId = useThreadStore((s) => s.autoFocusMessageId);
  const storeMessages = useThreadStore((s) => s.thread.context?.messages);
  const { appendMessage, moveMessage } = useThreadStoreActions();
  const [dragging, setDragging] = useState(false);
  const messages = messagesFromProps ?? storeMessages ?? [];
  const readonly = useMemo(() => {
    return readonlyFromProps || dragging || isSnapshotView;
  }, [dragging, isSnapshotView, readonlyFromProps]);

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
                />
              )}
            </Droppable>
          </DragDropContext>
        )}
        {!isSnapshotView && (
          <StreamingMessageListItem streaming={status === "running"} />
        )}
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
          onClick={appendMessage}
        >
          <PlusIcon className="size-4" />
          Add message
        </Button>
      </div>
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
}: {
  droppableProvided: DroppableProvided;
  messages: Message[];
  readonly: boolean;
  autoFocusMessageId: string | null;
  collapsedMessageIds: string[];
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
}: {
  message: Message;
  index: number;
  readonly: boolean;
  autoFocus: boolean;
  collapsed: boolean;
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
