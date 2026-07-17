"use client";

import { useModel, useResolveModelConfig } from "@llm-space/ui/components/model-provider";
import { useHostServices } from "@llm-space/ui/host";
import { cn } from "@llm-space/ui/lib/utils";

import { useThreadStore } from "../stores";

import { ModelParamsPopover } from "./model-params-popover";
import { ModelSelector } from "./model-selector";

export function ModelConfigEditor({
  className,
  readonly,
}: {
  className?: string;
  readonly?: boolean;
}) {
  // A thread may have no saved model, or a stale one whose provider was removed;
  // resolve it for display (own → default → first available). `null` when there
  // are no models at all.
  const savedModel = useThreadStore((s) => s.thread.model);
  const modelName = useThreadStore((s) => s.thread.modelName);
  const { presentational } = useHostServices();
  const model = useResolveModelConfig(savedModel);
  const resolvedModel = useModel({
    id: model?.id ?? "",
    provider: model?.provider ?? "",
  });

  const paramSummary: { label: string; value: string | number }[] = [];
  if (model?.params?.temperature !== undefined) {
    paramSummary.push({
      label: "temperature",
      value: model.params.temperature,
    });
  }
  if (model?.params?.maxTokens !== undefined) {
    paramSummary.push({ label: "max_tokens", value: model.params.maxTokens });
  }
  if (resolvedModel?.reasoning && model?.params?.reasoning !== undefined) {
    paramSummary.push({ label: "reasoning", value: model.params.reasoning });
  }
  if (model?.params?.responseType !== undefined) {
    paramSummary.push({
      label: "response_format",
      value: model.params.responseType.type,
    });
  }

  return (
    <div className={cn("group flex w-full", className)}>
      <div className="flex min-w-0 grow flex-col gap-2">
        <div className="flex cursor-default items-center text-sm">
          {presentational ? (
            // No model provider list on the web viewer — show the name that was
            // resolved at share time (or the raw saved id) as static text.
            <span className="text-muted-foreground truncate px-2 font-mono text-sm">
              {modelName ?? savedModel?.id ?? "(No model)"}
            </span>
          ) : (
            <ModelSelector value={model ?? null} readonly={readonly} />
          )}
        </div>
        {paramSummary.length > 0 ? (
          <div className="text-muted-foreground pl-2 text-xs">
            {paramSummary.map((item, index) => (
              <span key={item.label} className="font-mono">
                {index > 0 ? ", " : null}
                {item.label}: <span>{item.value}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <ModelParamsPopover
        readonly={readonly}
        maxTokens={resolvedModel?.maxTokens}
      />
    </div>
  );
}
