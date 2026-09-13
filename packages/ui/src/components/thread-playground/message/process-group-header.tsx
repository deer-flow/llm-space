import { ChevronRightIcon } from "lucide-react";
import { memo, useCallback } from "react";

import { Tooltip } from "@llm-space/ui/components/tooltip";
import { cn } from "@llm-space/ui/lib/utils";

import { usePlaygroundLabels } from "../playground-labels";
import { useThreadStoreActions } from "../stores";

import type { ProcessGroup } from "./process-groups";

/**
 * Header row of a collapsed (or expanded) cross-message process group. Shows
 * the total tool calls, the last tool used, and a warning count; clicking
 * toggles the group in the thread store.
 */
function _ProcessGroupHeader({
  group,
  collapsed,
}: {
  group: ProcessGroup;
  collapsed: boolean;
}) {
  const labels = usePlaygroundLabels();
  const { toggleProcessGroupExpanded } = useThreadStoreActions();
  const handleToggle = useCallback(() => {
    toggleProcessGroupExpanded(group.id);
  }, [group.id, toggleProcessGroupExpanded]);
  return (
    <Tooltip
      content={
        collapsed
          ? labels.dialogs.tooltips.expand
          : labels.dialogs.tooltips.collapse
      }
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        className="group/group-header hover:border-accent-foreground/20 hover:bg-accent/30 flex w-full cursor-pointer items-center gap-2 rounded-lg border bg-(--textarea) px-3 py-2.5 text-left text-sm transition-colors"
        onClick={handleToggle}
      >
        <ChevronRightIcon
          className={cn(
            "text-muted-foreground size-3.5 shrink-0 transition-transform",
            !collapsed && "rotate-90"
          )}
        />
        <span className="shrink-0 font-medium">
          {labels.dialogs.toolCalls.count(group.toolCallCount)}
        </span>
        {group.lastToolName ? (
          <span className="text-muted-foreground min-w-0 truncate font-mono text-xs">
            {labels.dialogs.processGroups.lastTool(group.lastToolName)}
          </span>
        ) : null}
        {group.errorCount > 0 ? (
          <span className="text-destructive/80 ml-auto shrink-0 text-xs">
            {labels.dialogs.processGroups.errors(group.errorCount)}
          </span>
        ) : null}
      </button>
    </Tooltip>
  );
}

export const ProcessGroupHeader = memo(_ProcessGroupHeader);
