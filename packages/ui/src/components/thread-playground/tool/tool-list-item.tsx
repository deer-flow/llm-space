"use client";

import {
  getToolDisplayName,
  isProviderHostedTool,
  type Tool,
} from "@llm-space/core";
import { CableIcon, CloudIcon, FunctionSquareIcon, XIcon } from "lucide-react";
import React, { memo, useCallback, useMemo } from "react";

import { Tooltip } from "@llm-space/ui/components/tooltip";
import { cn } from "@llm-space/ui/lib/utils";



import { getBuiltInToolIcon } from "./built-in-tool-icon";

function _ToolListItem({
  tool,
  readonly,
  onEdit,
  onRemove,
}: {
  tool: Tool;
  readonly?: boolean;

  onEdit: (tool: Tool) => void;

  onRemove: (tool: Tool) => void;
}) {
  const providerHosted = isProviderHostedTool(tool);
  const parameters = providerHosted ? undefined : tool.parameters;
  const keys = useMemo(
    () =>
      Object.keys(
        (parameters as Record<string, unknown> | undefined)?.properties ?? {}
      ),
    [parameters]
  );
  const required = useMemo(
    () => (parameters as { required?: string[] } | undefined)?.required ?? [],
    [parameters]
  );
  const displayName = getToolDisplayName(tool);
  const handleRemove = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onRemove(tool);
    },
    [onRemove, tool]
  );
  const ToolIcon =
    providerHosted
      ? CloudIcon
      : tool.type === "mcp"
      ? CableIcon
      : tool.type === "builtin"
        ? getBuiltInToolIcon(tool)
        : FunctionSquareIcon;
  const editDisabled = readonly;

  return (
    <div className="group/tool bg-secondary hover:text-accent-foreground inline-flex h-6 shrink-0 items-center rounded-md text-xs/relaxed transition-colors">
      <Tooltip
        content={
          providerHosted ? (
            <div className="max-w-80 text-xs">
              <div className="font-mono font-bold">{displayName}</div>
              <div className="pt-1 opacity-60">
                Runs inside the provider&apos;s model request.
              </div>
              <pre className="mt-2 overflow-auto">
                {JSON.stringify(tool.config, null, 2)}
              </pre>
            </div>
          ) : (
          <div>
            <div className="font-mono">
              <span className="text-primary font-bold">{displayName}</span>
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
          )
        }
      >
        <span className="inline-flex h-full">
          <button
            type="button"
            className="focus-visible:ring-ring/30 text-muted-foreground group-hover/tool:text-foreground inline-flex h-full items-center gap-1 rounded-l-md pl-2 outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50"
            aria-label={
              tool.type === "function"
                ? `Edit ${displayName} tool`
                : `Manage ${displayName} ${tool.type === "mcp" ? "MCP" : tool.type === "builtin" ? "built-in" : "provider-hosted"} tool`
            }
            disabled={editDisabled}
            onClick={() => onEdit(tool)}
          >
            <ToolIcon className="size-3.5 shrink-0 opacity-70" />
            <span className="font-mono">{displayName}</span>
          </button>
        </span>
      </Tooltip>
      <Tooltip content="Remove tool">
        <button
          type="button"
          disabled={readonly}
          aria-label={`Remove ${displayName} tool`}
          className={cn(
            "text-muted-foreground hover:text-accent-foreground focus-visible:ring-ring/30 inline-flex h-full items-center rounded-r-md pr-1 pl-1 outline-none hover:opacity-100 focus-visible:ring-2",
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
