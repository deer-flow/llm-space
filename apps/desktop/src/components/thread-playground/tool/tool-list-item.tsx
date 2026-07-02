"use client";

import { type FunctionTool } from "@llm-space/core";
import { SquareFunction, XIcon } from "lucide-react";
import React, { memo, useCallback, useMemo } from "react";

import { cn } from "@/lib/utils";

import { Tooltip } from "../../tooltip";

function _ToolListItem({
  tool,
  readonly,
  onEdit,
  onRemove,
}: {
  tool: FunctionTool;
  readonly?: boolean;

  onEdit: (tool: FunctionTool) => void;

  onRemove: (tool: FunctionTool) => void;
}) {
  const keys = useMemo(
    () =>
      Object.keys(
        (tool.parameters as Record<string, unknown>).properties ?? {}
      ),
    []
  );
  const required = useMemo(
    () => (tool.parameters as { required: string[] }).required ?? [],
    [tool.parameters]
  );
  const handleRemove = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onRemove(tool);
    },
    [onRemove, tool]
  );

  return (
    <div className="group/tool bg-secondary hover:text-accent-foreground inline-flex h-6 shrink-0 items-center rounded-md text-xs/relaxed transition-colors">
      <Tooltip
        content={
          <div>
            <div className="font-mono">
              <span className="text-primary font-bold">{tool.name}</span>
              <span>(</span>
              <span className="whitespace-pre-wrap">
                {keys.length > 0
                  ? "{\n" +
                    keys
                      .map((key) =>
                        required.includes(key) ? `  ${key}` : `  [${key}]`
                      )
                      .join(", \n") +
                    "\n}"
                  : ""}
              </span>
              <span>)</span>
            </div>
            {tool.description && (
              <div className="pt-2 text-xs whitespace-pre-wrap opacity-60">
                {tool.description}
              </div>
            )}
          </div>
        }
      >
        <button
          type="button"
          className="focus-visible:ring-ring/30 text-muted-foreground group-hover/tool:text-foreground inline-flex h-full items-center gap-1 rounded-l-md pl-2 outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50"
          aria-label={`Edit ${tool.name} tool`}
          disabled={readonly}
          onClick={() => onEdit(tool)}
        >
          <SquareFunction className="size-3.5 shrink-0 opacity-70" />
          <span className="font-mono">{tool.name}</span>
        </button>
      </Tooltip>
      <Tooltip content="Remove tool">
        <button
          type="button"
          disabled={readonly}
          aria-label={`Remove ${tool.name} tool`}
          className={cn(
            "text-muted-foreground hover:text-accent-foreground focus-visible:ring-ring/30 inline-flex h-full items-center rounded-r-md pr-1 pl-1 transition-opacity outline-none hover:opacity-100 focus-visible:ring-2",
            readonly ? "opacity-0!" : "opacity-0 group-hover/tool:opacity-100"
          )}
          onClick={handleRemove}
        >
          <XIcon className="size-3" />
        </button>
      </Tooltip>
    </div>
  );
}
export const ToolListItem = memo(_ToolListItem);
