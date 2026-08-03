import type { ProviderHostedToolActivity } from "@llm-space/core";
import { CloudIcon } from "lucide-react";
import { memo, useMemo } from "react";

import { Link } from "@llm-space/ui/components/link";

import { summarizeProviderHostedActivity } from "./provider-hosted-tool-activity-utils";

function _ProviderHostedToolActivityList({
  activities,
}: {
  activities: readonly ProviderHostedToolActivity[];
}) {
  const summaries = useMemo(
    () => activities.map(summarizeProviderHostedActivity),
    [activities]
  );
  if (activities.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 px-2 pt-2 pb-1">
      {activities.map((activity, index) => {
        const summary = summaries[index];
        return (
          <details
            key={activity.id ?? `${activity.type}-${index}`}
            className="bg-secondary/50 rounded-md px-2.5 py-2 text-xs"
          >
            <summary className="flex cursor-pointer list-none items-center gap-2">
              <CloudIcon className="size-3.5 opacity-70" />
              <span className="font-mono font-medium">{summary.label}</span>
              {summary.status && (
                <span className="text-muted-foreground">{summary.status}</span>
              )}
              {summary.query && (
                <span className="text-muted-foreground truncate">
                  {summary.query}
                </span>
              )}
              {summary.sources.length > 0 && (
                <span className="text-muted-foreground ml-auto">
                  {summary.sources.length} source
                  {summary.sources.length === 1 ? "" : "s"}
                </span>
              )}
            </summary>
            {summary.sources.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {summary.sources.map((source) => (
                  <Link
                    key={source.url}
                    className="truncate underline underline-offset-2"
                    href={source.url}
                  >
                    {source.title ?? new URL(source.url).hostname}
                  </Link>
                ))}
              </div>
            )}
            <pre className="bg-background/50 mt-2 max-h-56 overflow-auto rounded p-2 whitespace-pre-wrap">
              {JSON.stringify(activity.raw, null, 2)}
            </pre>
          </details>
        );
      })}
    </div>
  );
}

export const ProviderHostedToolActivityList = memo(
  _ProviderHostedToolActivityList
);
