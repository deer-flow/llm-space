import type { ThreadSnapshot } from "@llm-space/core";
import { Trash2Icon, XIcon } from "lucide-react";
import { memo, useMemo } from "react";
import { format } from "timeago.js";

import { cn } from "@/lib/utils";

import { useAutoAnimation } from "../../lib/use-auto-animation";
import { Tooltip } from "../tooltip";
import { Button } from "../ui/button";
import { Item, ItemContent, ItemDescription, ItemGroup } from "../ui/item";

import { useThreadStore, useThreadStoreActions } from "./stores";

/** A short summary of a run's resulting thread, derived from its last message. */
function _summarizeRun(thread: ThreadSnapshot): string {
  const messages = thread.context?.messages ?? [];
  const last = messages[messages.length - 1];
  if (!last) {
    return thread.context?.systemPrompt?.trim() || "Empty thread";
  }
  if (last.role === "assistant" && last.toolCalls?.length) {
    return last.toolCalls
      .map((toolCall) => `${toolCall.input.name}()`)
      .join(", ");
  }
  const imageCount = last.content.filter((c) => c.type === "image_data").length;
  if (imageCount > 0) {
    return `[${imageCount} image${imageCount > 1 ? "s" : ""}]`;
  }
  const text = last.content
    .flatMap((c) => (c.type === "text" ? [c.text] : []))
    .join(" ")
    .trim();
  return text || "Empty message";
}

/** The model label for a run snapshot, separated so it can truncate safely. */
function _runModelLabel(thread: ThreadSnapshot): string {
  return thread.model
    ? `${thread.model.provider}/${thread.model.id}`
    : "No model";
}

/** The message count label for a run snapshot, kept visible in narrow panels. */
function _runMessageCountLabel(thread: ThreadSnapshot): string {
  const messageCount = thread.context?.messages?.length ?? 0;
  return `${messageCount} message${messageCount === 1 ? "" : "s"}`;
}

function _RunHistoryListView({ onClose }: { onClose: () => void }) {
  const [containerRef] = useAutoAnimation();
  const runHistory = useThreadStore((s) => s.runHistory);
  const { restoreThread, removeRun } = useThreadStoreActions();
  const runs = useMemo(() => runHistory.slice().reverse(), [runHistory]);

  return (
    <div className="flex size-full flex-col">
      <div className="text-muted-foreground flex h-12 shrink-0 items-center justify-between border-b pl-3 text-sm">
        <div>Run history</div>
        <div className="pr-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close run history"
            onClick={onClose}
          >
            <XIcon className="size-3" />
          </Button>
        </div>
      </div>
      <ItemGroup
        ref={containerRef}
        className="min-h-0 grow gap-3.5! overflow-y-auto px-3 py-3.5"
      >
        {runs.length === 0 ? (
          <div className="text-muted-foreground m-auto text-xs">
            No runs yet
          </div>
        ) : (
          runs.map((run, index) => {
            const summary = _summarizeRun(run.thread);
            const modelLabel = _runModelLabel(run.thread);
            const messageCountLabel = _runMessageCountLabel(run.thread);
            const time = format(run.timestamp);
            return (
              <Item
                key={`${run.timestamp}-${index}`}
                size="sm"
                variant="muted"
                role="button"
                tabIndex={0}
                aria-label={`Restore run from ${time}: ${summary}. ${modelLabel}. ${messageCountLabel}`}
                className={cn(
                  "hover:bg-foreground/8! group cursor-pointer flex-col items-start gap-1",
                  // Flash the newest run's background, fading to the resting color.
                  index === 0 && "animate-run-history-enter"
                )}
                onClick={() => {
                  restoreThread(run.thread);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    restoreThread(run.thread);
                  }
                }}
              >
                <ItemContent className="w-full">
                  <ItemDescription className="text-foreground/60 group-hover:text-foreground line-clamp-2 w-full font-mono">
                    {summary}
                  </ItemDescription>
                </ItemContent>
                <div className="text-muted-foreground flex w-full min-w-0 items-baseline gap-1.5 text-[0.625rem]">
                  <span className="min-w-0 flex-1 truncate">
                    {time} · {modelLabel}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {messageCountLabel}
                  </span>
                  <Tooltip content="Remove run">
                    <button
                      type="button"
                      aria-label={`Remove run from ${time}`}
                      className="hover:text-foreground focus-visible:ring-ring/30 flex size-3.5 shrink-0 items-center justify-center self-center rounded-sm opacity-0 transition-opacity outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeRun(run);
                      }}
                      onKeyDown={(event) => {
                        // Keep Enter/Space from bubbling to the item's
                        // restore handler; other keys propagate as usual.
                        if (event.key === "Enter" || event.key === " ") {
                          event.stopPropagation();
                        }
                      }}
                    >
                      <Trash2Icon className="size-3" />
                    </button>
                  </Tooltip>
                </div>
              </Item>
            );
          })
        )}
      </ItemGroup>
    </div>
  );
}

export const RunHistoryListView = memo(_RunHistoryListView);
