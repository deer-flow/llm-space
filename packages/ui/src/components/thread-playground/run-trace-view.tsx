import {
  runMessageCountLabel,
  runModelLabel,
  summarizeRun,
  usageForRun,
  type RunSnapshot,
} from "@llm-space/core/thread";
import { memo } from "react";
import { format } from "timeago.js";

import { langToTimeago, useI18n } from "@llm-space/ui/lib/i18n";
import { cn } from "@llm-space/ui/lib/utils";


import { MessageListView } from "./message/message-list-view";
import { MessageStatsSummary } from "./message/message-stats-summary";

function _RunTraceView({
  className,
  run,
}: {
  className?: string;
  run: RunSnapshot | null;
}) {
  const { t, lang } = useI18n();
  if (!run) {
    return (
      <div className="text-muted-foreground px-4 py-8 text-center text-xs">
        {t.playground.runHistory.selectRunToInspect}
      </div>
    );
  }

  const messages = run.thread.context?.messages ?? [];
  const usage = usageForRun(run);
  const systemPrompt =
    run.thread.context?.systemPrompt?.trim() ||
    t.playground.eval.noSystemPrompt;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="shrink-0 border-b px-3 py-2.5">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="line-clamp-2 min-w-0 font-mono text-xs">
            {summarizeRun(run.thread)}
          </div>
          <div className="text-muted-foreground shrink-0 text-[0.625rem]">
            {format(run.timestamp, langToTimeago(lang))}
          </div>
        </div>
        <div className="text-muted-foreground mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[0.625rem]">
          <span>{runModelLabel(run.thread)}</span>
          <span>{runMessageCountLabel(run.thread)}</span>
          <span>{new Date(run.timestamp).toLocaleString()}</span>
        </div>
        {usage && <MessageStatsSummary className="mt-2" usage={usage} />}
      </div>
      <details className="group shrink-0 border-b px-3 py-2">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-[0.625rem] font-medium">
          {t.playground.eval.systemPrompt}
        </summary>
        <pre
          className={cn(
            "bg-background/70 mt-2 max-h-36 overflow-auto rounded-md border px-2 py-2",
            "font-mono text-[0.6875rem] leading-relaxed break-words whitespace-pre-wrap"
          )}
        >
          {systemPrompt}
        </pre>
      </details>
      <MessageListView
        className="min-h-0 flex-1"
        context={run.thread.context}
        messages={messages}
        readonly
      />
    </div>
  );
}

export const RunTraceView = memo(_RunTraceView);
