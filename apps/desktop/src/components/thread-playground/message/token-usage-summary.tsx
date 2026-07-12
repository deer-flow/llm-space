import type { ModelUsage } from "@llm-space/core";
import { hasModelUsage } from "@llm-space/core/thread";
import { GaugeIcon } from "lucide-react";
import { memo, useMemo } from "react";

import { cn } from "@/lib/utils";

import { Tooltip } from "../../tooltip";
import {
  formatCompactUsage,
  formatUsageSummary,
  usageBreakdownRows,
} from "../token-usage";

function _TokenUsageSummary({
  className,
  usage,
  variant = "default",
}: {
  className?: string;
  usage: ModelUsage | null | undefined;
  variant?: "default" | "header";
}) {
  const rows = useMemo(
    () => (hasModelUsage(usage) ? usageBreakdownRows(usage) : []),
    [usage]
  );
  const label = useMemo(
    () =>
      hasModelUsage(usage)
        ? variant === "header"
          ? formatCompactUsage(usage)
          : formatUsageSummary(usage)
        : null,
    [usage, variant]
  );
  if (!usage || !label) {
    return null;
  }

  return (
    <Tooltip
      content={
        <div className="min-w-44 text-xs">
          <div className="text-foreground mb-1 font-medium">Token Usage</div>
          <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
            {rows.map((row) => (
              <div key={row.label} className="contents">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="text-right font-mono tabular-nums">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      }
    >
      <div
        aria-label={`Token usage: ${label}`}
        className={cn(
          "text-muted-foreground bg-foreground/4 flex w-fit max-w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-[0.625rem]",
          variant === "header" &&
            "min-h-6 max-w-80 rounded px-1.5 py-1 text-[0.5625rem] leading-3",
          className
        )}
      >
        <GaugeIcon className="size-3 shrink-0" />
        <span
          className={cn(
            "font-mono tabular-nums",
            variant === "header"
              ? "min-w-0 break-words whitespace-normal"
              : "truncate"
          )}
        >
          {label}
        </span>
      </div>
    </Tooltip>
  );
}

export const TokenUsageSummary = memo(_TokenUsageSummary);
