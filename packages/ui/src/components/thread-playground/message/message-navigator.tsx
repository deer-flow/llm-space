import type { Message } from "@llm-space/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { BotIcon, ImageIcon, UserIcon, WrenchIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";

import { cn } from "@llm-space/ui/lib/utils";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@llm-space/ui/ui/hover-card";

import { messagePreview } from "./message-preview";

const NAVIGATOR_ITEM_HEIGHT = 13;
const NAVIGATOR_OVERSCAN = 5;

function _MessageNavigator({
  activeIndex,
  messages,
  onJump,
}: {
  activeIndex: number | null;
  messages: Message[];
  onJump: (index: number) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const getItemKey = useCallback(
    (index: number) => messages[index]?.id ?? index,
    [messages]
  );
  const virtualizer = useVirtualizer({
    count: messages.length,
    estimateSize: () => NAVIGATOR_ITEM_HEIGHT,
    getItemKey,
    getScrollElement: () => viewportRef.current,
    overscan: NAVIGATOR_OVERSCAN,
    paddingStart: 4,
    paddingEnd: 4,
  });

  useEffect(() => {
    if (activeIndex === null) {
      return;
    }
    virtualizer.scrollToIndex(activeIndex, { align: "auto" });
  }, [activeIndex, virtualizer]);

  return (
    <nav
      aria-label="Message navigation"
      className="pointer-events-none absolute top-1/2 -left-2 z-50 -translate-y-1/2"
    >
      <div
        ref={viewportRef}
        className="hover:bg-background/70 focus-within:bg-background/70 pointer-events-auto max-h-[45vh] w-7 overflow-y-auto rounded-full opacity-65 transition-[background-color,opacity] focus-within:opacity-100 hover:opacity-100"
      >
        <div
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const message = messages[virtualItem.index];
            if (!message) {
              return null;
            }
            return (
              <div
                key={virtualItem.key}
                className="absolute top-0 left-1.5"
                style={{
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <MessageAnchor
                  active={virtualItem.index === activeIndex}
                  index={virtualItem.index}
                  message={message}
                  total={messages.length}
                  onJump={onJump}
                />
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

function _MessageAnchor({
  active,
  index,
  message,
  total,
  onJump,
}: {
  active: boolean;
  index: number;
  message: Message;
  total: number;
  onJump: (index: number) => void;
}) {
  const preview = useMemo(() => messagePreview(message), [message]);
  const imageCount = message.content.filter(
    (content) => content.type === "image"
  ).length;
  const toolCount =
    message.role === "assistant" ? (message.toolCalls?.length ?? 0) : 0;
  const roleLabel = message.role === "user" ? "User" : "Assistant";

  return (
    <HoverCard openDelay={250} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          aria-current={active ? "location" : undefined}
          aria-label={`Jump to ${roleLabel.toLowerCase()} message ${index + 1} of ${total}`}
          className="group/anchor flex h-3 w-5 shrink-0 cursor-pointer items-center rounded-sm outline-none"
          type="button"
          onClick={() => onJump(index)}
        >
          <span
            className={cn(
              "bg-muted-foreground/55 group-hover/anchor:bg-foreground group-focus-visible/anchor:bg-foreground h-0.5 w-5 origin-left scale-x-[0.4] transform-gpu rounded-full transition-[scale,background-color] group-hover/anchor:scale-x-100 group-focus-visible/anchor:scale-x-100 motion-reduce:transition-none",
              active ? "bg-accent-foreground" : ""
            )}
          />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="center"
        className="w-72 p-3"
        side="right"
        sideOffset={8}
      >
        <div className="flex items-center gap-2">
          <div className="bg-foreground/6 text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-md">
            {message.role === "user" ? (
              <UserIcon className="size-3.5" />
            ) : (
              <BotIcon className="size-3.5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="font-medium">{roleLabel} message</div>
            <div className="text-muted-foreground text-[0.625rem]">
              {index + 1} of {total}
            </div>
          </div>
        </div>
        <p className="text-foreground/85 mt-2 line-clamp-3 text-xs leading-relaxed">
          {preview}
        </p>
        {imageCount > 0 || toolCount > 0 ? (
          <div className="text-muted-foreground mt-2 flex items-center gap-3 text-[0.625rem]">
            {imageCount > 0 ? (
              <span className="flex items-center gap-1">
                <ImageIcon className="size-3" />
                {imageCount} image{imageCount === 1 ? "" : "s"}
              </span>
            ) : null}
            {toolCount > 0 ? (
              <span className="flex items-center gap-1">
                <WrenchIcon className="size-3" />
                {toolCount} tool call{toolCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}

const MessageAnchor = memo(_MessageAnchor);

export const MessageNavigator = memo(_MessageNavigator);
