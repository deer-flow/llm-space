import { getMessageText, type Message } from "@llm-space/core";
import { BotIcon, ImageIcon, UserIcon, WrenchIcon } from "lucide-react";
import {
  memo,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { cn } from "@llm-space/ui/lib/utils";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@llm-space/ui/ui/hover-card";

const ANCHOR_SELECTOR = "[data-navigation-anchor-id]";

function _getAnchorElements(content: HTMLDivElement): HTMLElement[] {
  return Array.from(content.querySelectorAll<HTMLElement>(ANCHOR_SELECTOR));
}

function _getAnchorElement(
  content: HTMLDivElement,
  anchorId: string
): HTMLElement | undefined {
  return _getAnchorElements(content).find(
    (element) => element.dataset.navigationAnchorId === anchorId
  );
}

function _getActiveAnchorId(
  viewport: HTMLElement,
  elements: HTMLElement[]
): string | null {
  const viewportRect = viewport.getBoundingClientRect();
  const referenceY = viewportRect.top + viewportRect.height / 2;
  let nearestId: string | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearestHeight = Number.POSITIVE_INFINITY;

  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (rect.bottom < viewportRect.top || rect.top > viewportRect.bottom) {
      continue;
    }

    const distance =
      rect.top <= referenceY && rect.bottom >= referenceY
        ? 0
        : Math.min(
            Math.abs(rect.top - referenceY),
            Math.abs(rect.bottom - referenceY)
          );
    if (
      distance < nearestDistance ||
      (distance === nearestDistance && rect.height < nearestHeight)
    ) {
      nearestDistance = distance;
      nearestHeight = rect.height;
      nearestId = element.dataset.navigationAnchorId ?? null;
    }
  }

  return nearestId;
}

function _messagePreview(message: Message): string {
  const text = getMessageText(message).replace(/\s+/g, " ").trim();
  if (text) {
    return text;
  }

  const imageCount = message.content.filter(
    (content) => content.type === "image"
  ).length;
  if (imageCount > 0) {
    return `${imageCount} image attachment${imageCount === 1 ? "" : "s"}`;
  }

  if (message.role === "assistant" && message.toolCalls?.length) {
    return message.toolCalls
      .map((toolCall) => `${toolCall.input.name}()`)
      .join(", ");
  }

  if (
    message.role === "assistant" &&
    message.providerHostedToolActivities?.length
  ) {
    return message.providerHostedToolActivities
      .map((activity) => activity.type)
      .join(", ");
  }

  if (message.role === "assistant" && message.thinking?.trim()) {
    return message.thinking.replace(/\s+/g, " ").trim();
  }

  return "Empty message";
}

function _MessageNavigator({
  contentRef,
  messages,
}: {
  contentRef: RefObject<HTMLDivElement | null>;
  messages: Message[];
}) {
  const [activeAnchorId, setActiveAnchorId] = useState<string | null>(null);
  const anchorIdKey = useMemo(
    () => messages.map((message) => `message:${message.id}`).join("\u0000"),
    [messages]
  );

  useEffect(() => {
    const content = contentRef.current;
    const viewport = content?.closest<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    );
    if (!content || !viewport) {
      return;
    }

    let frame = 0;
    const updateActiveAnchor = () => {
      frame = 0;
      const nextId = _getActiveAnchorId(viewport, _getAnchorElements(content));
      setActiveAnchorId((currentId) =>
        currentId === nextId ? currentId : nextId
      );
    };
    const scheduleUpdate = () => {
      if (frame === 0) {
        frame = window.requestAnimationFrame(updateActiveAnchor);
      }
    };

    updateActiveAnchor();
    viewport.addEventListener("scroll", scheduleUpdate, { passive: true });
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(viewport);
    resizeObserver.observe(content);

    return () => {
      viewport.removeEventListener("scroll", scheduleUpdate);
      resizeObserver.disconnect();
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [anchorIdKey, contentRef]);

  const jumpToAnchor = useCallback(
    (anchorId: string) => {
      const content = contentRef.current;
      const element = content ? _getAnchorElement(content, anchorId) : undefined;
      if (!element) {
        return;
      }
      element.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      });
      setActiveAnchorId(anchorId);
    },
    [contentRef]
  );

  return (
    <nav
      aria-label="Message navigation"
      className="pointer-events-none absolute top-1/2 -left-2 z-50 -translate-y-1/2"
    >
      <div className="hover:bg-background/70 focus-within:bg-background/70 pointer-events-auto flex max-h-[45vh] w-7 flex-col items-start gap-px overflow-hidden hover:overflow-y-auto rounded-full py-1 pl-1.5 opacity-65 transition-[background-color,opacity] focus-within:opacity-100 hover:opacity-100">
        {messages.map((message, index) => {
          const messageAnchorId = `message:${message.id}`;
          return (
            <MessageAnchor
              key={message.id}
              active={messageAnchorId === activeAnchorId}
              anchorId={messageAnchorId}
              index={index}
              message={message}
              total={messages.length}
              onJump={jumpToAnchor}
            />
          );
        })}
      </div>
    </nav>
  );
}

function _MessageAnchor({
  active,
  anchorId,
  index,
  message,
  total,
  onJump,
}: {
  active: boolean;
  anchorId: string;
  index: number;
  message: Message;
  total: number;
  onJump: (anchorId: string) => void;
}) {
  const preview = useMemo(() => _messagePreview(message), [message]);
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
          onClick={() => onJump(anchorId)}
        >
          <span
            className={cn(
              "bg-muted-foreground/55 group-hover/anchor:bg-foreground group-focus-visible/anchor:bg-foreground h-0.5 w-5 origin-left scale-x-[0.4] transform-gpu rounded-full transition-[scale,background-color] motion-reduce:transition-none group-hover/anchor:scale-x-100 group-focus-visible/anchor:scale-x-100",
              active ? "bg-accent-foreground" : "",
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
