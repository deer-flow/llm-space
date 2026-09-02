import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Message, ThreadContext } from "@llm-space/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PlusIcon } from "lucide-react";
import {
  memo,
  type Ref,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
  type DisplayMessage,
  resolveDisplayMessages,
} from "./display-messages";
import {
  ImageDisplayProvider,
  type ImageDisplayContextValue,
} from "./image-display-context";
import { MessageListItem } from "./message-list-item";
import { resolveMessageMove } from "./message-move";
import { MessageNavigator } from "./message-navigator";
import { followMessageViewportBottom } from "./message-scroll-stability";
import { findCenteredVirtualItemIndex } from "./virtual-item-center";
import { measureVirtualRowHeight } from "./virtual-row-measurement";

const MESSAGE_VIRTUALIZATION_THRESHOLD = 20;
const MESSAGE_OVERSCAN = 5;
const MESSAGE_HEIGHT_CACHE_LIMIT = 1_000;
const MESSAGE_HEIGHT_CACHE = new Map<string, number>();
const DND_MODIFIERS = [restrictToVerticalAxis];

function _messageHeightCacheKey(message: Message, collapsed: boolean) {
  return `${message.id}:${collapsed ? "collapsed" : "expanded"}`;
}

function _rememberMessageHeight(key: string, height: number) {
  MESSAGE_HEIGHT_CACHE.delete(key);
  MESSAGE_HEIGHT_CACHE.set(key, height);
  if (MESSAGE_HEIGHT_CACHE.size > MESSAGE_HEIGHT_CACHE_LIMIT) {
    const oldestKey = MESSAGE_HEIGHT_CACHE.keys().next().value;
    if (oldestKey !== undefined) {
      MESSAGE_HEIGHT_CACHE.delete(oldestKey);
    }
  }
}

function _estimateMessageHeight(message: Message, collapsed: boolean) {
  const cacheKey = _messageHeightCacheKey(message, collapsed);
  const cachedHeight = MESSAGE_HEIGHT_CACHE.get(cacheKey);
  if (cachedHeight !== undefined) {
    return cachedHeight;
  }
  if (collapsed) {
    return 56;
  }

  const textLength = message.content.reduce(
    (total, content) =>
      total + (content.type === "text" ? content.text.length : 0),
    0
  );
  const imageCount = message.content.filter(
    (content) => content.type === "image"
  ).length;
  let height = 88 + Math.min(552, Math.ceil(textLength / 160) * 24);
  height += imageCount * 220;

  if (message.role === "assistant") {
    for (const toolCall of message.toolCalls ?? []) {
      height += toolCall.input.name === "web_search" ? 590 : 390;
    }
  }
  return Math.max(88, height);
}

export function MessageListView({
  className,
  context: contextFromProps,
  messages: messagesFromProps,
  readonly: readonlyFromProps = false,
  compactImages = false,
  measurementsFrozen = false,
}: {
  className?: string;
  context?: ThreadContext;
  messages?: Message[];
  readonly?: boolean;
  /** Render image attachments as `[Image #N]` placeholders. */
  compactImages?: boolean;
  /** Keep measured heights while an ancestor is hidden. */
  measurementsFrozen?: boolean;
}) {
  const isSnapshotView = messagesFromProps !== undefined;
  const status = useThreadStore((state) => state.status);
  const streamingMessageId = useThreadStore(
    (state) => state.streamingMessage?.id ?? null
  );
  const collapsedMessageIds = useThreadStore(
    (state) => state.collapsedMessageIds
  );
  const autoFocusMessageId = useThreadStore(
    (state) => state.autoFocusMessageId
  );
  const runValidationIssue = useThreadStore(
    (state) => state.runValidationIssue
  );
  const storeMessages = useThreadStore(
    (state) => state.thread.context?.messages
  );
  const {
    appendMessage,
    consumeAutoFocusMessage,
    moveMessage,
    resolveRunValidationIssue,
  } = useThreadStoreActions();
  const [dragging, setDragging] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [activeMessageIndex, setActiveMessageIndex] = useState<number | null>(
    null
  );
  const activeMessageIndexRef = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const messages = useMemo(
    () => messagesFromProps ?? storeMessages ?? [],
    [messagesFromProps, storeMessages]
  );
  const readonly = readonlyFromProps || isSnapshotView;
  const displayRows = useMemo(
    () =>
      isSnapshotView
        ? messages.map((message) => ({ message, streaming: false }))
        : resolveDisplayMessages(
            messages,
            streamingMessageId,
            status === "running"
          ),
    [isSnapshotView, messages, status, streamingMessageId]
  );
  const displayMessages = useMemo(
    () => displayRows.map((row) => row.message),
    [displayRows]
  );
  const messageIds = useMemo(
    () => messages.map((message) => message.id),
    [messages]
  );
  const autoFocusMessageIndex = autoFocusMessageId
    ? messages.findIndex((message) => message.id === autoFocusMessageId)
    : -1;
  const validationMessageId = runValidationIssue?.messageId ?? null;
  const validationMessageIndex = validationMessageId
    ? messages.findIndex((message) => message.id === validationMessageId)
    : -1;
  const collapsedMessageIdSet = useMemo(
    () => new Set(collapsedMessageIds),
    [collapsedMessageIds]
  );
  const shouldVirtualize =
    displayRows.length > MESSAGE_VIRTUALIZATION_THRESHOLD;
  const getMessageKey = useCallback(
    (index: number) => displayMessages[index]?.id ?? index,
    [displayMessages]
  );
  const getScrollElement = useCallback(
    () =>
      contentRef.current?.closest<HTMLElement>(
        '[data-slot="scroll-area-viewport"]'
      ) ?? null,
    []
  );
  const estimateMessageSize = useCallback(
    (index: number) => {
      const message = displayMessages[index];
      return message
        ? _estimateMessageHeight(
            message,
            collapsedMessageIdSet.has(message.id)
          )
        : 240;
    },
    [collapsedMessageIdSet, displayMessages]
  );
  // TanStack Virtual exposes a mutable imperative controller by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
    count: shouldVirtualize ? displayRows.length : 0,
    estimateSize: estimateMessageSize,
    getItemKey: getMessageKey,
    getScrollElement,
    overscan: MESSAGE_OVERSCAN,
    paddingStart: 12,
    directDomUpdates: true,
    directDomUpdatesMode: "transform",
    useCachedMeasurements: measurementsFrozen || dragging,
    measureElement: (element, entry) => {
      const height = measureVirtualRowHeight(element, entry);
      const index = Number(element.getAttribute("data-index"));
      const message = displayMessages[index];
      if (message && height > 0) {
        _rememberMessageHeight(
          _messageHeightCacheKey(
            message,
            collapsedMessageIdSet.has(message.id)
          ),
          height
        );
      }
      return height;
    },
    onChange: (instance) => {
      if (!shouldVirtualize) {
        return;
      }
      const viewportHeight = instance.scrollRect?.height ?? 0;
      if (viewportHeight <= 0) {
        return;
      }
      const index = findCenteredVirtualItemIndex(
        instance.getVirtualItems(),
        instance.scrollOffset ?? 0,
        viewportHeight
      );
      if (activeMessageIndexRef.current !== index) {
        activeMessageIndexRef.current = index;
        setActiveMessageIndex(index);
      }
    },
  });
  const addMessageSuggested =
    runValidationIssue?.resolution?.type === "appendUserMessage";

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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const activeMessage = useMemo(
    () => messages.find((message) => message.id === activeMessageId) ?? null,
    [activeMessageId, messages]
  );
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveMessageId(String(event.active.id));
    setDragging(true);
  }, []);
  const handleDragCancel = useCallback(() => {
    setActiveMessageId(null);
    setDragging(false);
  }, []);
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveMessageId(null);
      setDragging(false);
      const move = resolveMessageMove(
        messageIds,
        String(event.active.id),
        event.over ? String(event.over.id) : null
      );
      if (move) moveMessage(move.sourceIndex, move.destinationIndex);
    },
    [messageIds, moveMessage]
  );
  const scrollToMessageIndex = useCallback(
    (
      index: number,
      align: "auto" | "center",
      behavior: ScrollBehavior = "auto"
    ) => {
      if (shouldVirtualize) {
        virtualizer.scrollToIndex(index, { align, behavior });
        return;
      }
      contentRef.current
        ?.querySelector<HTMLElement>(`[data-message-row-index="${index}"]`)
        ?.scrollIntoView({
          block: align === "center" ? "center" : "nearest",
          behavior,
        });
    },
    [shouldVirtualize, virtualizer]
  );
  const jumpToMessage = useCallback(
    (index: number) => {
      activeMessageIndexRef.current = index;
      setActiveMessageIndex(index);
      scrollToMessageIndex(
        index,
        "center",
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth"
      );
    },
    [scrollToMessageIndex]
  );

  useEffect(() => {
    if (shouldVirtualize && !measurementsFrozen) {
      virtualizer.measure();
    }
  }, [measurementsFrozen, shouldVirtualize, virtualizer]);
  useEffect(() => {
    if (shouldVirtualize) {
      return;
    }
    const viewport = getScrollElement();
    const content = contentRef.current;
    if (!viewport || !content) {
      return;
    }

    let frameId: number | null = null;
    const updateActiveMessage = () => {
      frameId = null;
      const viewportCenter =
        viewport.getBoundingClientRect().top + viewport.clientHeight / 2;
      let closestIndex: number | null = null;
      let closestDistance = Number.POSITIVE_INFINITY;
      for (const row of content.querySelectorAll<HTMLElement>(
        "[data-message-row-index]"
      )) {
        const rect = row.getBoundingClientRect();
        const distance =
          viewportCenter < rect.top
            ? rect.top - viewportCenter
            : viewportCenter > rect.bottom
              ? viewportCenter - rect.bottom
              : 0;
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = Number(row.dataset.messageRowIndex);
        }
      }
      if (activeMessageIndexRef.current !== closestIndex) {
        activeMessageIndexRef.current = closestIndex;
        setActiveMessageIndex(closestIndex);
      }
    };
    const scheduleUpdate = () => {
      if (frameId === null) {
        frameId = requestAnimationFrame(updateActiveMessage);
      }
    };
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(viewport);
    resizeObserver.observe(content);
    viewport.addEventListener("scroll", scheduleUpdate, { passive: true });
    scheduleUpdate();
    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      resizeObserver.disconnect();
      viewport.removeEventListener("scroll", scheduleUpdate);
    };
  }, [displayRows.length, getScrollElement, shouldVirtualize]);
  useEffect(() => {
    if (status !== "running") {
      return;
    }
    const viewport = getScrollElement();
    const content = contentRef.current;
    if (!viewport || !content) {
      return;
    }
    return followMessageViewportBottom(viewport, content);
  }, [getScrollElement, status]);
  useEffect(() => {
    if (!autoFocusMessageId || autoFocusMessageIndex < 0) {
      return;
    }
    scrollToMessageIndex(autoFocusMessageIndex, "auto");
    consumeAutoFocusMessage(autoFocusMessageId);
  }, [
    autoFocusMessageId,
    autoFocusMessageIndex,
    consumeAutoFocusMessage,
    scrollToMessageIndex,
  ]);
  useEffect(() => {
    if (!validationMessageId || validationMessageIndex < 0) {
      return;
    }
    scrollToMessageIndex(validationMessageIndex, "auto");
  }, [validationMessageId, validationMessageIndex, scrollToMessageIndex]);

  const virtualItems = virtualizer.getVirtualItems();
  const showNavigator = displayMessages.length > 1;

  return (
    <div className={cn("relative size-full", className)}>
      <ScrollArea
        type="auto"
        className="size-full"
        // TanStack Virtual already preserves the visible offset as rows mount.
        // Native scroll anchoring would compensate a second time and can trap
        // upward scrolling at a virtual-row boundary.
        viewportClassName="[overflow-anchor:none]"
      >
        <ImageDisplayProvider value={imageDisplay}>
          <div ref={contentRef} className="p-3 pt-0.5">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={DND_MODIFIERS}
              onDragStart={handleDragStart}
              onDragCancel={handleDragCancel}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={messageIds}
                strategy={verticalListSortingStrategy}
              >
                {/* TanStack writes the virtual height directly to the DOM, so
                    these layouts must not reuse the same container node. */}
                {shouldVirtualize ? (
                  <div
                    key="virtualized"
                    ref={virtualizer.containerRef}
                    className="relative w-full"
                  >
                    {virtualItems.map((virtualItem) => {
                      const row = displayRows[virtualItem.index];
                      if (!row) {
                        return null;
                      }
                      return (
                        <MessageRow
                          key={virtualItem.key}
                          measureRef={virtualizer.measureElement}
                          virtualized
                          index={virtualItem.index}
                          row={row}
                          context={contextFromProps}
                          readonly={readonly}
                          autoFocusMessageId={autoFocusMessageId}
                          collapsed={collapsedMessageIdSet.has(row.message.id)}
                          runValidationIssue={runValidationIssue}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div key="standard" className="w-full pt-3">
                    {displayRows.map((row, index) => (
                      <MessageRow
                        key={row.message.id}
                        index={index}
                        row={row}
                        context={contextFromProps}
                        readonly={readonly}
                        autoFocusMessageId={autoFocusMessageId}
                        collapsed={collapsedMessageIdSet.has(row.message.id)}
                        runValidationIssue={runValidationIssue}
                      />
                    ))}
                  </div>
                )}
              </SortableContext>
              <DragOverlay>
                {activeMessage ? (
                  <div className="pb-3.5 opacity-95">
                    <MessageListItem
                      context={contextFromProps}
                      message={activeMessage}
                      readonly
                      collapsed={collapsedMessageIdSet.has(activeMessage.id)}
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
            <div className="relative rounded-lg">
              <Button
                className={cn(
                  "text-muted-foreground hover:text-accent-foreground w-full justify-start rounded-lg py-5 hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_2%)]!",
                  dragging && "invisible",
                  readonly && "hidden"
                )}
                disabled={readonly}
                variant="secondary"
                size="lg"
                onClick={
                  addMessageSuggested
                    ? resolveRunValidationIssue
                    : appendMessage
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
      {showNavigator ? (
        <MessageNavigator
          activeIndex={activeMessageIndex}
          messages={displayMessages}
          onJump={jumpToMessage}
        />
      ) : null}
    </div>
  );
}

function MessageRow({
  measureRef,
  virtualized = false,
  index,
  row,
  context,
  readonly,
  autoFocusMessageId,
  collapsed,
  runValidationIssue,
}: {
  measureRef?: Ref<HTMLDivElement>;
  virtualized?: boolean;
  index: number;
  row: DisplayMessage;
  context?: ThreadContext;
  readonly: boolean;
  autoFocusMessageId: string | null;
  collapsed: boolean;
  runValidationIssue: RunValidationIssue | null;
}) {
  return (
    <div
      ref={measureRef}
      className={cn(
        "w-full",
        virtualized && "absolute top-0 left-0 will-change-transform"
      )}
      data-index={index}
      data-message-row-index={index}
    >
      {row.streaming ? (
        <StreamingMessageRow message={row.message} />
      ) : (
        <SortableMessageRow
          context={context}
          message={row.message}
          readonly={readonly}
          autoFocus={row.message.id === autoFocusMessageId}
          collapsed={collapsed}
          runValidationIssue={
            row.message.id === runValidationIssue?.messageId
              ? runValidationIssue
              : null
          }
        />
      )}
    </div>
  );
}

const _SortableMessageRow = function SortableMessageRow({
  context,
  message,
  readonly,
  autoFocus,
  collapsed,
  runValidationIssue,
}: {
  context?: ThreadContext;
  message: Message;
  readonly: boolean;
  autoFocus: boolean;
  collapsed: boolean;
  runValidationIssue: RunValidationIssue | null;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: message.id, disabled: readonly });
  const dragHandleProps = useMemo(
    () => ({ attributes, listeners: listeners ?? {}, setActivatorNodeRef }),
    [attributes, listeners, setActivatorNodeRef]
  );
  return (
    <div
      ref={setNodeRef}
      className="pb-3.5"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        visibility: isDragging ? "hidden" : undefined,
      }}
    >
      <MessageListItem
        context={context}
        message={message}
        readonly={readonly}
        autoFocus={autoFocus}
        collapsed={collapsed}
        runValidationIssue={runValidationIssue}
        dragHandleProps={dragHandleProps}
      />
    </div>
  );
};
const SortableMessageRow = memo(_SortableMessageRow);

function StreamingMessageRow({ message }: { message: Message }) {
  const liveMessage = useThreadStore((state) =>
    state.streamingMessage?.id === message.id ? state.streamingMessage : null
  );
  return (
    <div className="pb-3.5">
      <MessageListItem message={liveMessage ?? message} readonly streaming />
    </div>
  );
}
