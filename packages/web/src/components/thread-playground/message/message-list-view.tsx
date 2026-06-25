import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import type { AssistantMessage } from "@llm-space/core";
import { PlusIcon } from "lucide-react";
import { useCallback, useMemo, useState, type CSSProperties } from "react";

import { cn } from "@/lib/utils";
import { useThreadStore, useThreadStoreActions } from "@/stores/thread-store";

import { Tooltip } from "../../tooltip";
import { Button } from "../../ui/button";

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
  const { appendMessage, insertMessageBefore, moveMessage } =
    useThreadStoreActions();
  const [dragging, setDragging] = useState(false);
  const readonly = useMemo(() => {
    return readonlyFromProps || dragging || dragging;
  }, [status, dragging, readonlyFromProps]);
  const handleDragStart = useCallback(() => {
    setDragging(true);
  }, []);
  const handleDragEnd = useCallback((result: DropResult) => {
    setDragging(false);
    const { source, destination } = result;
    if (!destination || source.index === destination.index) return;
    moveMessage(source.index, destination.index);
  }, []);
  return (
    <div className={cn("flex flex-col p-3 pt-0.5", className)}>
      <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <Droppable droppableId="message-list">
          {(droppableProvided) => (
            <div
              className="flex flex-col"
              ref={droppableProvided.innerRef}
              {...droppableProvided.droppableProps}
            >
              {(messages ?? []).map((message, index) => (
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
                        style={style as CSSProperties}
                      >
                        <div
                          className={cn(
                            "group relative flex h-3 w-full shrink-0",
                            readonly && "invisible"
                          )}
                        >
                          <div className="absolute left-0 right-2 top-1.5 border-b border-dashed opacity-0 transition-opacity group-hover:opacity-100"></div>
                          <Tooltip content="Insert message here">
                            <Button
                              className="text-muted-foreground hover:text-accent-foreground absolute -right-3 -top-1 z-10 -rotate-90 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                              variant="outline"
                              size="icon-xs"
                              onClick={() => insertMessageBefore(message.id)}
                            >
                              <PlusIcon className="size-3" />
                            </Button>
                          </Tooltip>
                        </div>
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
          )}
        </Droppable>
      </DragDropContext>
      <StreamingMessageListItem streaming={status === "running"} />
      <Button
        className={cn(
          "text-muted-foreground hover:text-accent-foreground mt-3.5 w-full justify-start rounded-lg py-5",
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
      className="mt-3.5"
      message={streamingMessage}
      readonly
      streaming
    />
  );
}
