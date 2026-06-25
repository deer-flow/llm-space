"use client";

import { resolveModel } from "@llm-space/core";
import { TriangleAlertIcon } from "lucide-react";
import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { useThreadStore } from "@/stores/thread-store";

import { Tooltip } from "../../tooltip";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../../ui/hover-card";

import { ModelCard } from "./model-card";
import { ModelParamsPopover } from "./model-params-popover";

export function ModelConfigEditor({
  className,
  readonly,
}: {
  className?: string;
  readonly?: boolean;
}) {
  const model = useThreadStore((s) => s.thread.model);
  const resolvedModel = useMemo(() => {
    return resolveModel(model);
  }, [model]);

  const paramSummary: { label: string; value: string | number }[] = [];
  if (model.params?.temperature !== undefined) {
    paramSummary.push({
      label: "temperature",
      value: model.params.temperature,
    });
  }
  if (model.params?.maxTokens !== undefined) {
    paramSummary.push({ label: "max_tokens", value: model.params.maxTokens });
  }
  if (resolvedModel?.reasoning && model.params?.reasoning !== undefined) {
    paramSummary.push({ label: "reasoning", value: model.params.reasoning });
  }

  return (
    <div className={cn("group flex w-full", className)}>
      <div className="flex min-w-0 grow flex-col gap-2">
        <div className="flex cursor-default items-center text-sm">
          {resolvedModel ? (
            <HoverCard openDelay={10} closeDelay={100}>
              <HoverCardTrigger asChild>
                <div className="truncate">{resolvedModel.name}</div>
              </HoverCardTrigger>
              <HoverCardContent align="start" className="w-96">
                <ModelCard model={resolvedModel} />
              </HoverCardContent>
            </HoverCard>
          ) : (
            <Tooltip
              content={`The "${model.provider}/${model.id}" is not resolved`}
            >
              <div className="flex items-center gap-1">
                <TriangleAlertIcon className="size-3 text-amber-400" />
                <span className="text-amber-400">{model.id}</span>
              </div>
            </Tooltip>
          )}
        </div>
        {paramSummary.length > 0 ? (
          <div className="text-muted-foreground font-mono text-sm">
            {paramSummary.map((item, index) => (
              <span key={item.label}>
                {index > 0 ? ", " : null}
                {item.label.charAt(0).toUpperCase() + item.label.slice(1)}:{" "}
                <span className="text-[#98ecac]">{item.value}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <ModelParamsPopover readonly={readonly} />
    </div>
  );
}
