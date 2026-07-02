import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { getMessageText, type Message } from "@llm-space/core";
import {
  BotIcon,
  ChevronDownIcon,
  GripHorizontalIcon,
  MinusCircle,
  PlayCircleIcon,
  UserIcon,
} from "lucide-react";
import { memo, useCallback, useMemo } from "react";

import { cn } from "@/lib/utils";

import { Tooltip } from "../../tooltip";
import { Button } from "../../ui/button";
import { useThreadStoreActions } from "../stores";

import { AddImagesMenu } from "./add-images-menu";

function _MessageListItemHeader({
  message,
  readonly = false,
  collapsed,
  dragHandleProps,
}: {
  message: Message;
  readonly?: boolean;
  collapsed?: boolean;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
}) {
  const { run, removeMessage, toggleMessageRole, toggleMessageCollapsed } =
    useThreadStoreActions();
  const runnable = useMemo(
    () =>
      message.role === "user" ||
      (message.role === "assistant" &&
        message.toolCalls &&
        message.toolCalls.length > 0),
    [message]
  );
  // A one-line preview shown beside the role tag while collapsed: the text
  // content, or a summary of tool calls when there is no text. Only computed
  // while collapsed — an expanded message re-renders on every streamed token.
  const preview = useMemo(() => {
    if (!collapsed) {
      return "";
    }
    const text = getMessageText(message).replace(/\s+/g, " ").trim();
    if (text) {
      return text;
    }
    if (message.role === "assistant" && message.toolCalls?.length) {
      return message.toolCalls.map((tc) => `${tc.input.name}()`).join(", ");
    }
    return "";
  }, [collapsed, message]);
  const handleRun = useCallback(async () => {
    await run(message.id);
  }, [run, message.id]);
  const handleRemove = useCallback(() => {
    removeMessage(message.id);
  }, [removeMessage, message.id]);
  const handleToggleMessageRole = useCallback(() => {
    toggleMessageRole(message.id);
  }, [toggleMessageRole, message.id]);
  const handleToggleMessageCollapse = useCallback(() => {
    toggleMessageCollapsed(message.id);
  }, [toggleMessageCollapsed, message.id]);
  return (
    <header className="relative flex w-full shrink-0 items-center px-2 pt-2">
      <Tooltip content="Drag to reorder">
        <div
          {...dragHandleProps}
          aria-label={`${message.role === "user" ? "User" : "Assistant"} message drag handle`}
          className={cn(
            // A small grab affordance near the top edge, centered (out of
            // flow, so nothing else moves). `z-20` keeps it above the
            // positioned collapse-toggle spacer, which is a later sibling and
            // would otherwise capture the clicks.
            "text-muted-foreground hover:text-foreground hover:bg-foreground/8 absolute top-0.5 left-1/2 z-20 flex h-4 w-9 -translate-x-1/2 cursor-grab items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-70 active:cursor-grabbing",
            // Hidden while collapsed: the row shows a content preview instead,
            // and the centered handle would sit on top of it.
            collapsed && "hidden",
            readonly && "invisible"
          )}
        >
          <GripHorizontalIcon className="size-3" />
        </div>
      </Tooltip>
      <div className="flex shrink-0 items-center">
        <Tooltip content="Toggle role">
          <Button
            className="px-2"
            variant="outline"
            size="sm"
            aria-label={`Change message role from ${message.role}`}
            disabled={readonly}
            onClick={handleToggleMessageRole}
          >
            <div className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1">
              {message.role === "user" ? (
                <>
                  <UserIcon className="size-3" />
                  <div>User</div>
                </>
              ) : (
                <>
                  <BotIcon className="size-3" />
                  <div>Assistant</div>
                </>
              )}
            </div>
          </Button>
        </Tooltip>
      </div>
      <div
        className="relative h-full min-h-full min-w-0 grow"
        onClick={handleToggleMessageCollapse}
      >
        &nbsp;
        {collapsed && preview && (
          // Absolutely positioned so the (nowrap) preview never contributes to
          // the intrinsic width of the surrounding ScrollArea's `display:table`
          // viewport — otherwise it would grow the whole list instead of
          // truncating. Its width is bounded by this in-flow grow cell.
          <span className="text-muted-foreground absolute top-1/2 right-0 left-2 -translate-y-1/2 truncate text-sm">
            {preview}
          </span>
        )}
      </div>
      <div
        className={cn(
          "flex shrink-0 items-center opacity-0 transition-opacity",
          !readonly && "group-hover:opacity-100"
        )}
      >
        {message.role === "user" && (
          <AddImagesMenu messageId={message.id} disabled={readonly} />
        )}
        <Tooltip
          content={runnable ? "Run from this message" : "No runnable content"}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={
              runnable
                ? "Run from this message"
                : "Cannot run from this message"
            }
            disabled={readonly || !runnable}
            onClick={handleRun}
          >
            <PlayCircleIcon className="size-4" />
          </Button>
        </Tooltip>
        <Tooltip content="Remove message">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remove message"
            disabled={readonly}
            onClick={handleRemove}
          >
            <MinusCircle className="size-4" />
          </Button>
        </Tooltip>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={collapsed ? "Expand message" : "Collapse message"}
          aria-expanded={!collapsed}
          disabled={readonly}
          onClick={handleToggleMessageCollapse}
        >
          <ChevronDownIcon
            className={cn(
              "size-4 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-in-out",
              collapsed && "-rotate-90"
            )}
          />
        </Button>
      </div>
    </header>
  );
}

export const MessageListItemHeader = memo(_MessageListItemHeader);
