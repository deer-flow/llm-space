"use client";

import type { AgentStatusComponent } from "@llm-space/core";
import { XIcon } from "lucide-react";
import { memo, useCallback, type MouseEvent } from "react";

import { Tooltip } from "@llm-space/ui/components/tooltip";
import { cn } from "@llm-space/ui/lib/utils";

import { getAgentStatusComponentOption } from "./agent-status-options";

function _AgentStatusListItem({
  component,
  readonly,
  onEdit,
  onRemove,
}: {
  component: AgentStatusComponent;
  readonly?: boolean;
  onEdit: (component: AgentStatusComponent) => void;
  onRemove: (component: AgentStatusComponent) => void;
}) {
  const option = getAgentStatusComponentOption(component);
  const Icon = option.icon;
  const handleRemove = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      onRemove(component);
    },
    [component, onRemove]
  );

  return (
    <div className="group/agent-status bg-secondary hover:text-accent-foreground inline-flex h-6 shrink-0 items-center rounded-md text-xs/relaxed transition-colors">
      <Tooltip content={option.description}>
        <button
          type="button"
          disabled={readonly}
          aria-label={"配置" + option.label}
          className="focus-visible:ring-ring/30 text-muted-foreground group-hover/agent-status:text-foreground inline-flex h-full items-center gap-1 rounded-l-md pl-2 outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50"
          onClick={() => onEdit(component)}
        >
          <Icon className="size-3.5 shrink-0 opacity-70" />
          <span>{option.label}</span>
        </button>
      </Tooltip>
      <Tooltip content={"移除" + option.label}>
        <button
          type="button"
          disabled={readonly}
          aria-label={"移除" + option.label}
          className={cn(
            "text-muted-foreground hover:text-accent-foreground focus-visible:ring-ring/30 inline-flex h-full items-center rounded-r-md pr-1 pl-1 outline-none hover:opacity-100 focus-visible:ring-2",
            readonly
              ? "opacity-0!"
              : "opacity-0 group-hover/agent-status:opacity-100"
          )}
          onClick={handleRemove}
        >
          <XIcon className="size-3" />
        </button>
      </Tooltip>
    </div>
  );
}

export const AgentStatusListItem = memo(_AgentStatusListItem);
