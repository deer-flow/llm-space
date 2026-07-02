import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
  type DroppableProvided,
} from "@hello-pangea/dnd";
import type { AssistantMessage, Message } from "@llm-space/core";
import { PlusIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { useAutoAnimation } from "@/lib/use-auto-animation";
import { cn } from "@/lib/utils";

import { Button } from "../../ui/button";
import { ScrollArea } from "../../ui/scroll-area";
import { useThreadStore, useThreadStoreActions } from "../stores";

import { MessageListItem } from "./message-list-item";

export function MessageListView({
  className,
  readonly: readonlyFromProps = false,
}: {
  className?: string;
  readonly?: boolean;
}) {
  const status = useThreadStore((s) => s.status);
  const collapsedMessageIds = useThreadStore((s) => s.collapsedMessageIds);
  const messages = useThreadStore((s) => s.thread.context?.messages);
  const { appendMessage, moveMessage } = useThreadStoreActions();
  const [dragging, setDragging] = useState(false);
  const readonly = useMemo(() => {
    return readonlyFromProps || dragging;
  }, [dragging, readonlyFromProps]);

  const handleDragStart = useCallback(() => {
    setDragging(true);
  }, []);
  const handleDragEnd = useCallback((result: DropResult) => {
    setDragging(false);
    const { source, destination } = result;
    if (!destination || source.index === destination.index) return;
    moveMessage(source.index, destination.index);
  }, []);

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
    <ScrollArea className={cn("size-full", className)}>
      <div ref={contentRef} className="flex flex-col p-3 pt-0.5">
        <DragDropContext
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <Droppable droppableId="message-list">
            {(droppableProvided) => (
              <DroppableMessageList
                droppableProvided={droppableProvided}
                messages={messages ?? []}
                dragging={dragging}
                readonly={readonly}
                collapsedMessageIds={collapsedMessageIds}
              />
            )}
          </Droppable>
        </DragDropContext>
        <StreamingMessageListItem streaming={status === "running"} />
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

function DroppableMessageList({
  droppableProvided,
  messages,
  dragging,
  readonly,
  collapsedMessageIds,
}: {
  droppableProvided: DroppableProvided;
  messages: Message[];
  dragging: boolean;
  readonly: boolean;
  collapsedMessageIds: string[];
}) {
  const [animationContainerRef, enableAnimations] = useAutoAnimation({
    duration: 150,
  });
  const droppableInnerRef = useRef(droppableProvided.innerRef);
  droppableInnerRef.current = droppableProvided.innerRef;

  useEffect(() => {
    const enabled = !readonly && !dragging;
    if (!enabled) {
      enableAnimations(false);
      return;
    }
    const frameId = requestAnimationFrame(() => {
      enableAnimations(true);
    });
    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [enableAnimations, readonly, dragging]);

  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      droppableInnerRef.current(node);
      animationContainerRef(node);
    },
    [animationContainerRef]
  );

  return (
    <div
      className="flex flex-col pt-3"
      ref={setContainerRef}
      {...droppableProvided.droppableProps}
    >
      {messages.map((message, index) => (
        <Draggable
          key={message.id}
          draggableId={message.id}
          index={index}
          isDragDisabled={readonly}
        >
          {(draggableProvided) => {
            const { style, ...draggableProps } =
              draggableProvided.draggableProps;
            return (
              <div
                ref={draggableProvided.innerRef}
                {...draggableProps}
                // Spacing lives on the draggable as a margin (not a flex `gap`
                // on the list) because @hello-pangea/dnd measures item margins
                // to size the placeholder and compute drag displacement — a
                // `gap` is invisible to it and offsets every item mid-drag.
                className="mb-3.5"
                style={style as CSSProperties}
              >
                <MessageListItem
                  message={message}
                  readonly={readonly}
                  collapsed={collapsedMessageIds.includes(message.id)}
                  dragHandleProps={draggableProvided.dragHandleProps}
                />
              </div>
            );
          }}
        </Draggable>
      ))}
      {droppableProvided.placeholder}
    </div>
  );
}

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
