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

import { usePlaygroundLabels } from "../playground-labels";
import {
  type RunValidationIssue,
  useThreadStore,
  useThreadStoreActions,
} from "../stores";

import { resolveDisplayRows } from "./display-messages";
import {
  ImageDisplayProvider,
  type ImageDisplayContextValue,
} from "./image-display-context";
import { MessageListItem } from "./message-list-item";
import { resolveMessageMove } from "./message-move";
import { MessageNavigator } from "./message-navigator";
import { followMessageViewportBottom } from "./message-scroll-stability";
import { ProcessGroupHeader } from "./process-group-header";
import {
  type DisplayRow,
  findCollapsedGroupIdForMessage,
  useCollapseProcessGroups,
} from "./process-groups";
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
  const { dialogs } = usePlaygroundLabels();
  const isSnapshotView = messagesFromProps !== undefined;
  const status = useThreadStore((state) => state.status);
  const streamingMessageId = useThreadStore(
    (state) => state.streamingMessage?.id ?? null
  );
  const collapsedMessageIds = useThreadStore(
    (state) => state.collapsedMessageIds
  );
  const expandedProcessGroupIds = useThreadStore(
    (state) => state.expandedProcessGroupIds
  );
  const collapseProcessGroups = useCollapseProcessGroups();
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
    toggleProcessGroupExpanded,
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
  // Grouping is purely structural: a group only wraps steps that ended with a
  // result, so a new run's in-flight steps (a trailing, unterminated span)
  // never collapse, while older completed groups stay collapsed across the
  // run. Disabling grouping wholesale while running would re-expand every
  // historical group and shift the reading position mid-conversation.
  const groupingEnabled = collapseProcessGroups;
  const displayRows = useMemo(
    () =>
      resolveDisplayRows(
        messages,
        isSnapshotView ? null : streamingMessageId,
        isSnapshotView ? false : status === "running",
        {
          groupingEnabled,
          expandedGroupIds: expandedProcessGroupIds,
        }
      ),
    [
      expandedProcessGroupIds,
      groupingEnabled,
      isSnapshotView,
      messages,
      status,
      streamingMessageId,
    ]
  );
  // Navigator anchors: a collapsed group is represented by its first member.
  const navigatorMessages = useMemo(
    () =>
      displayRows.map((row) =>
        row.kind === "processGroup" ? row.group.messages[0] : row.message
      ),
    [displayRows]
  );
  const messageIds = useMemo(
    () => messages.map((message) => message.id),
    [messages]
  );
  // Map a message id to its displayed row index. Only rows that are actually
  // rendered are mapped: a member hidden inside a collapsed group has no row
  // index, and its targets are revealed by the expansion effect below before
  // anything scrolls to them.
  const displayIndexByMessageId = useMemo(() => {
    const map = new Map<string, number>();
    displayRows.forEach((row, index) => {
      if (row.kind === "message") {
        map.set(row.message.id, index);
      }
    });
    return map;
  }, [displayRows]);
  const autoFocusMessageIndex = autoFocusMessageId
    ? (displayIndexByMessageId.get(autoFocusMessageId) ?? -1)
    : -1;
  const validationMessageId = runValidationIssue?.messageId ?? null;
  const validationMessageIndex = validationMessageId
    ? (displayIndexByMessageId.get(validationMessageId) ?? -1)
    : -1;
  const collapsedMessageIdSet = useMemo(
    () => new Set(collapsedMessageIds),
    [collapsedMessageIds]
  );
  const shouldVirtualize =
    displayRows.length > MESSAGE_VIRTUALIZATION_THRESHOLD;
  const getMessageKey = useCallback(
    (index: number) => {
      const row = displayRows[index];
      if (!row) {
        return index;
      }
      return row.kind === "processGroup"
        ? `group:${row.group.id}`
        : row.message.id;
    },
    [displayRows]
  );
  const getScrollElement = useCallback(
    () =>
      contentRef.current?.closest<HTMLElement>(
        '[data-slot="scroll-area-viewport"]'
      ) ?? null,
    []
  );
  const estimateRowSize = useCallback(
    (index: number) => {
      const row = displayRows[index];
      if (!row) {
        return 240;
      }
      if (row.kind === "processGroup") {
        // A collapsed group is a single fixed header row; an expanded group's
        // header is measured like any other row.
        return MESSAGE_HEIGHT_CACHE.get(`${row.group.id}:group`) ?? 56;
      }
      return _estimateMessageHeight(
        row.message,
        collapsedMessageIdSet.has(row.message.id)
      );
    },
    [collapsedMessageIdSet, displayRows]
  );
  // TanStack Virtual exposes a mutable imperative controller by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
    count: shouldVirtualize ? displayRows.length : 0,
    estimateSize: estimateRowSize,
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
      const row = displayRows[index];
      if (row && height > 0) {
        _rememberMessageHeight(
          row.kind === "processGroup"
            ? `${row.group.id}:group`
            : _messageHeightCacheKey(
                row.message,
                collapsedMessageIdSet.has(row.message.id)
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
  // A validation error or a freshly-inserted message can target a member
  // hidden inside a collapsed group. Reveal the group first; the scroll /
  // autofocus effects below then run once the target row actually mounts
  // (its display index resolves), instead of stopping at the header.
  useEffect(() => {
    const groupIds = new Set<string>();
    for (const messageId of [validationMessageId, autoFocusMessageId]) {
      if (!messageId) {
        continue;
      }
      const groupId = findCollapsedGroupIdForMessage(displayRows, messageId);
      if (groupId) {
        groupIds.add(groupId);
      }
    }
    // Toggle once per group: the two targets can hide in the same group, and
    // a double toggle would cancel out and loop.
    for (const groupId of groupIds) {
      toggleProcessGroupExpanded(groupId);
    }
  }, [autoFocusMessageId, displayRows, toggleProcessGroupExpanded, validationMessageId]);
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
  const showNavigator = navigatorMessages.length > 1;

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
                          collapsed={
                            row.kind === "message" &&
                            collapsedMessageIdSet.has(row.message.id)
                          }
                          runValidationIssue={runValidationIssue}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div key="standard" className="w-full pt-3">
                    {displayRows.map((row, index) => (
                      <MessageRow
                        key={
                          row.kind === "processGroup"
                            ? `group-header:${row.group.id}`
                            : row.message.id
                        }
                        index={index}
                        row={row}
                        context={contextFromProps}
                        readonly={readonly}
                        autoFocusMessageId={autoFocusMessageId}
                        collapsed={
                          row.kind === "message" &&
                          collapsedMessageIdSet.has(row.message.id)
                        }
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
                {dialogs.messages.add}
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
          messages={navigatorMessages}
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
  row: DisplayRow;
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
      {row.kind === "processGroup" ? (
        <div className="pb-3.5">
          <ProcessGroupHeader group={row.group} collapsed={row.collapsed} />
        </div>
      ) : row.streaming ? (
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
