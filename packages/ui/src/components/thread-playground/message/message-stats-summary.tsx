import type { AssistantMessageTiming, ModelUsage } from "@llm-space/core";
import {
  formatTokens,
  formatUsageSummary,
  hasModelUsage,
  outputTokensPerSecond,
  usageBreakdownRows,
} from "@llm-space/core/thread";
import { GaugeIcon } from "lucide-react";
import { memo, useCallback, useMemo, type MouseEvent } from "react";

import { Tooltip } from "@llm-space/ui/components/tooltip";
import { formatString, useI18n } from "@llm-space/ui/lib/i18n";
import { cn } from "@llm-space/ui/lib/utils";

import { useMessageStatsSummaryMode } from "./message-stats-summary-mode";

const COMPACT_TOKEN_FORMATTER = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function _formatDuration(
  durationMs: number,
  t: ReturnType<typeof useI18n>["t"]
): string {
  if (durationMs < 1000) {
    return formatString(t.playground.message.stats.durationMs, {
      n: Math.round(durationMs),
    });
  }
  if (durationMs < 10_000) {
    return formatString(t.playground.message.stats.durationSeconds, {
      n: (durationMs / 1000).toFixed(2),
    });
  }
  if (durationMs < 60_000) {
    return formatString(t.playground.message.stats.durationSeconds, {
      n: (durationMs / 1000).toFixed(1),
    });
  }
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return formatString(t.playground.message.stats.durationMinutes, {
    m: minutes,
    s: seconds,
  });
}

function _TokenUsageBar({ usage }: { usage: ModelUsage }) {
  const { t } = useI18n();
  const cached = usage.cacheRead + usage.cacheWrite;
  const total = usage.input + usage.output + cached;
  if (total <= 0) {
    return null;
  }

  return (
    <div
      role="img"
      aria-label={formatString(t.playground.message.stats.tokenUsageBarLabel, {
        input: formatTokens(usage.input),
        output: formatTokens(usage.output),
        cached: formatTokens(cached),
      })}
      className="mt-2 w-72 max-w-full"
    >
      <div className="bg-foreground/8 flex h-2 overflow-hidden rounded-full">
        {usage.input > 0 && (
          <div
            className="h-full bg-yellow-500 dark:bg-yellow-400"
            style={{
              flexBasis: 0,
              flexGrow: usage.input,
              minWidth: "3px",
            }}
          />
        )}
        {usage.output > 0 && (
          <div
            className="h-full bg-blue-500 dark:bg-blue-400"
            style={{
              flexBasis: 0,
              flexGrow: usage.output,
              minWidth: "3px",
            }}
          />
        )}
        {cached > 0 && (
          <div
            className="h-full bg-emerald-500 dark:bg-emerald-400"
            style={{ flexBasis: 0, flexGrow: cached, minWidth: "3px" }}
          />
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.5625rem]">
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-yellow-500 dark:bg-yellow-400" />
          {formatString(t.playground.message.stats.legendInput, {
            n: formatTokens(usage.input),
          })}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-blue-500 dark:bg-blue-400" />
          {formatString(t.playground.message.stats.legendOutput, {
            n: formatTokens(usage.output),
          })}
        </span>
        {cached > 0 && (
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
            {formatString(t.playground.message.stats.legendCached, {
              n: formatTokens(cached),
            })}
          </span>
        )}
      </div>
    </div>
  );
}

function _TimingTimeline({ timing }: { timing: AssistantMessageTiming }) {
  const { t } = useI18n();
  const firstTokenMs = timing.firstTokenMs;
  const hasFirstToken = firstTokenMs !== undefined;
  const firstTokenPercent =
    hasFirstToken && timing.durationMs > 0
      ? Math.min(100, Math.max(0, (firstTokenMs / timing.durationMs) * 100))
      : 0;
  const generationMs = hasFirstToken
    ? Math.max(0, timing.durationMs - firstTokenMs)
    : null;
  const ariaLabel = hasFirstToken
    ? formatString(t.playground.message.stats.timelineAriaWithFirstToken, {
        firstToken: _formatDuration(firstTokenMs, t),
        total: _formatDuration(timing.durationMs, t),
      })
    : formatString(t.playground.message.stats.timelineAria, {
        total: _formatDuration(timing.durationMs, t),
      });

  return (
    <div role="img" aria-label={ariaLabel} className="mt-1.5 w-72 max-w-full">
      <div className="relative pt-4">
        {hasFirstToken && (
          <span
            className={cn(
              "text-muted-foreground absolute top-0 text-[0.5625rem] whitespace-nowrap",
              firstTokenPercent < 25
                ? ""
                : firstTokenPercent > 75
                  ? "-translate-x-full"
                  : "-translate-x-1/2"
            )}
            style={{ left: `${firstTokenPercent}%` }}
          >
            {t.playground.message.stats.firstToken}
          </span>
        )}
        <div className="bg-foreground/8 relative flex h-2 overflow-hidden rounded-full">
          {hasFirstToken && firstTokenMs > 0 && (
            <div
              className="bg-muted-foreground/50 border-foreground h-full border-r"
              style={{
                flexBasis: 0,
                flexGrow: firstTokenMs,
                minWidth: "3px",
              }}
            />
          )}
          {generationMs !== null && generationMs > 0 && (
            <div
              className="h-full bg-blue-500 dark:bg-blue-400"
              style={{
                flexBasis: 0,
                flexGrow: generationMs,
                minWidth: "3px",
              }}
            />
          )}
          {!hasFirstToken && (
            <div className="h-full w-full bg-blue-500 dark:bg-blue-400" />
          )}
        </div>
        <div className="text-muted-foreground mt-0.5 flex justify-between text-[0.5625rem]">
          <span>{t.playground.message.stats.requestSent}</span>
          <span>{t.playground.message.stats.complete}</span>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.5625rem]">
        {hasFirstToken && (
          <span className="flex items-center gap-1">
            <span className="bg-muted-foreground/50 size-1.5 rounded-full" />
            {formatString(t.playground.message.stats.waiting, {
              duration: _formatDuration(firstTokenMs, t),
            })}
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-blue-500 dark:bg-blue-400" />
          {generationMs === null
            ? t.playground.message.stats.response
            : formatString(t.playground.message.stats.generating, {
                duration: _formatDuration(generationMs, t),
              })}
        </span>
      </div>
    </div>
  );
}

function _MessageStatsSummary({
  className,
  usage,
  timing,
  variant = "default",
}: {
  className?: string;
  usage?: ModelUsage | null;
  timing?: AssistantMessageTiming | null;
  variant?: "default" | "header";
}) {
  const { mode, setMode } = useMessageStatsSummaryMode();
  const { t } = useI18n();
  const usageRows = useMemo(
    () => (hasModelUsage(usage) ? usageBreakdownRows(usage) : []),
    [usage]
  );
  const usageLabel = useMemo(
    () => (hasModelUsage(usage) ? formatUsageSummary(usage) : null),
    [usage]
  );
  const tokensPerSecond = useMemo(
    () => outputTokensPerSecond(usage, timing),
    [timing, usage]
  );
  const timingLabel = useMemo(() => {
    if (!timing) {
      return null;
    }
    return formatString(t.playground.message.stats.durationTotal, {
      duration: _formatDuration(timing.durationMs, t),
    });
  }, [t, timing]);
  const tokenLabel = useMemo(() => {
    if (!hasModelUsage(usage)) {
      return null;
    }
    const cached = usage.cacheRead + usage.cacheWrite;
    return [
      formatString(t.playground.message.stats.tokenCountIn, {
        n: COMPACT_TOKEN_FORMATTER.format(usage.input),
      }),
      formatString(t.playground.message.stats.tokenCountOut, {
        n: COMPACT_TOKEN_FORMATTER.format(usage.output),
      }),
      formatString(t.playground.message.stats.tokenCountCached, {
        n: COMPACT_TOKEN_FORMATTER.format(cached),
      }),
    ].join(" / ");
  }, [t, usage]);
  const label =
    variant === "header"
      ? mode === "timing"
        ? (timingLabel ?? t.playground.message.stats.noTiming)
        : (tokenLabel ?? t.playground.message.stats.noTokenUsage)
      : [usageLabel, timingLabel].filter(Boolean).join(" · ");
  const handleToggleMode = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      setMode(mode === "timing" ? "tokens" : "timing");
    },
    [mode, setMode]
  );
  if (!label) {
    return null;
  }

  const summaryClassName = cn(
    "text-muted-foreground bg-foreground/4 flex w-fit max-w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-[0.625rem]",
    variant === "header" &&
      "min-h-6 max-w-80 rounded px-1.5 py-1 text-[0.5625rem] leading-3",
    className
  );
  const summaryContent = (
    <>
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
    </>
  );

  return (
    <Tooltip
      content={
        <div className="min-w-72 text-xs">
          {usageRows.length > 0 && (
            <section>
              <div className="text-foreground mb-1 font-medium">
                {t.playground.message.stats.tokenUsage}
              </div>
              {usage && <_TokenUsageBar usage={usage} />}
              <div className="mt-2 grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
                {usageRows.map((row) => (
                  <div key={row.label} className="contents">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="text-right font-mono tabular-nums">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {timing && (
            <section className={cn(usageRows.length > 0 && "mt-5")}>
              <div className="text-foreground mb-1 font-medium">
                {t.playground.message.stats.timing}
              </div>
              <_TimingTimeline timing={timing} />
              <div className="mt-1.5 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 leading-tight">
                <span className="text-muted-foreground">
                  {t.playground.message.stats.totalResponseTime}
                </span>
                <span className="text-right font-mono tabular-nums">
                  {_formatDuration(timing.durationMs, t)}
                </span>
                {timing?.firstTokenMs !== undefined && (
                  <>
                    <span className="text-muted-foreground">
                      {t.playground.message.stats.timeToFirstToken}
                    </span>
                    <span className="text-right font-mono tabular-nums">
                      {_formatDuration(timing.firstTokenMs, t)}
                    </span>
                  </>
                )}
                {tokensPerSecond !== null && (
                  <>
                    <span className="text-muted-foreground">
                      {t.playground.message.stats.tokensPerSecond}
                    </span>
                    <span className="text-right font-mono tabular-nums">
                      {formatString(
                        t.playground.message.stats.tokensPerSecondValue,
                        { n: tokensPerSecond.toFixed(1) }
                      )}
                    </span>
                  </>
                )}
              </div>
              {timing.firstTokenMs !== undefined && (
                <p className="text-muted-foreground mt-1.5 text-[0.5625rem] leading-snug">
                  {t.playground.message.stats.tpsNote}
                </p>
              )}
            </section>
          )}
        </div>
      }
    >
      {variant === "header" ? (
        <button
          type="button"
          aria-label={formatString(t.playground.message.stats.showingStats, {
            mode:
              mode === "timing"
                ? t.playground.message.stats.modeTotalResponseTime
                : t.playground.message.stats.modeTokenUsage,
            label,
            other:
              mode === "timing"
                ? t.playground.message.stats.modeTokenUsage
                : t.playground.message.stats.modeTotalResponseTime,
          })}
          className={cn(
            summaryClassName,
            "hover:text-foreground focus-visible:ring-ring cursor-pointer border-0 text-left outline-none focus-visible:ring-[3px]"
          )}
          onClick={handleToggleMode}
        >
          {summaryContent}
        </button>
      ) : (
        <div
          aria-label={formatString(t.playground.message.stats.responseStatistics, {
            label,
          })}
          className={summaryClassName}
        >
          {summaryContent}
        </div>
      )}
    </Tooltip>
  );
}

export const MessageStatsSummary = memo(_MessageStatsSummary);
