import type { Thread } from "@llm-space/core";
import { memo, useMemo } from "react";
import { format } from "timeago.js";

import { cn } from "@/lib/utils";
import { useThreadStore, useThreadStoreActions } from "@/stores/thread-store";

import { useAutoAnimation } from "../../lib/use-auto-animation";
import { Item, ItemContent, ItemDescription, ItemGroup } from "../ui/item";

/** A short summary of a run's resulting thread, derived from its last message. */
function _summarizeRun(thread: Thread): string {
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

function _RunHistoryListView() {
  const [containerRef] = useAutoAnimation();
  const runHistory = useThreadStore((s) => s.runHistory);
  const { restoreThread } = useThreadStoreActions();
  const runs = useMemo(() => runHistory.slice().reverse(), [runHistory]);

  return (
    <div className="flex size-full flex-col">
      <div className="text-muted-foreground flex h-12 shrink-0 items-center border-b px-3 text-sm">
        Run history
      </div>
      <ItemGroup
        ref={containerRef}
        className="gap-3.5! min-h-0 grow overflow-y-auto px-3 py-3.5"
      >
        {runs.length === 0 ? (
          <div className="text-muted-foreground m-auto text-xs">
            No runs yet
          </div>
        ) : (
          runs.map((run, index) => (
            <Item
              key={run.timestamp}
              size="sm"
              variant="muted"
              className={cn(
                "hover:bg-foreground/8! group cursor-pointer flex-col items-start gap-1",
                // Flash the newest run's background, fading to the resting color.
                index === 0 && "animate-run-history-enter"
              )}
              onClick={() => {
                restoreThread(run.thread);
              }}
            >
              <ItemContent className="w-full">
                <ItemDescription className="text-foreground/60 group-hover:text-foreground line-clamp-2 w-full font-mono">
                  {_summarizeRun(run.thread)}
                </ItemDescription>
              </ItemContent>
              <span className="text-muted-foreground text-[0.625rem]">
                {format(run.timestamp)}
              </span>
            </Item>
          ))
        )}
      </ItemGroup>
    </div>
  );
}

export const RunHistoryListView = memo(_RunHistoryListView);
