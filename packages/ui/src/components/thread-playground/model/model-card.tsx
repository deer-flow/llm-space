import type { ModelConfig } from "@llm-space/core";
import type { ReactNode } from "react";

import { cn } from "@llm-space/ui/lib/utils";

import { useModel, useModels } from "../../model-provider";
import { usePlaygroundLabels } from "../playground-labels";

function formatTokenCount(value: number) {
  return value.toLocaleString();
}

function formatCostPerMillion(value: number) {
  return `$${value.toFixed(2)}/M`;
}

function ModelCardField({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 border-t py-3 text-xs first-of-type:border-t-0",
        className
      )}
    >
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="min-w-0 text-right font-mono tabular-nums">{value}</span>
    </div>
  );
}

function BoolValue({
  value,
  labels,
}: {
  value: boolean;
  labels: { supported: string; notSupported: string };
}) {
  return (
    <span className={value ? "" : "text-muted-foreground"}>
      {value ? labels.supported : labels.notSupported}
    </span>
  );
}

export function ModelCard({
  model,
  className,
}: {
  model: ModelConfig | null;
  className?: string;
}) {
  const providers = useModels();
  const { dialogs, providerDisplayName } = usePlaygroundLabels();
  const labels = dialogs.modelCard;
  const resolvedModel = useModel({
    id: model?.id ?? "",
    provider: model?.provider ?? "",
  });
  if (!resolvedModel) {
    return null;
  }
  const providerName =
    providers.find((group) => group.id === resolvedModel.provider)?.name ??
    resolvedModel.provider;
  const displayedProviderName = providerDisplayName({
    id: resolvedModel.provider,
    name: providerName,
  });
  const supportsImageInput = resolvedModel.input.includes("image");
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <main className="flex flex-col">
        <ModelCardField label={labels.model} value={resolvedModel.id} />
        <ModelCardField label={labels.provider} value={displayedProviderName} />
        <ModelCardField label={labels.apiType} value={resolvedModel?.api} />
        <ModelCardField
          label={labels.baseUrl}
          value={
            <span className="text-left break-all">{resolvedModel.baseUrl}</span>
          }
        />
        <ModelCardField
          label={labels.contextWindow}
          value={formatTokenCount(resolvedModel.contextWindow)}
        />
        <ModelCardField
          label={labels.maxTokens}
          value={formatTokenCount(resolvedModel.maxTokens)}
        />
        <ModelCardField
          label={labels.reasoning}
          value={<BoolValue value={resolvedModel.reasoning} labels={labels} />}
        />
        <ModelCardField
          label={labels.imageInput}
          value={<BoolValue value={supportsImageInput} labels={labels} />}
        />
        <ModelCardField
          label={labels.inputCost}
          value={formatCostPerMillion(resolvedModel.cost.input)}
        />
        <ModelCardField
          label={labels.outputCost}
          value={formatCostPerMillion(resolvedModel.cost.output)}
        />
      </main>
    </div>
  );
}
