import type { ModelConfig } from "@llm-space/core";
import type { ReactNode } from "react";

import { cn } from "@llm-space/ui/lib/utils";


import { useModel, useModels } from "../../model-provider";

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

function BoolValue({ value }: { value: boolean }) {
  return (
    <span className={value ? "" : "text-muted-foreground"}>
      {value ? "Supported" : "Not supported"}
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
  const supportsImageInput = resolvedModel.input.includes("image");
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <main className="flex flex-col">
        <ModelCardField label="Model" value={resolvedModel.id} />
        <ModelCardField label="Provider" value={providerName} />
        <ModelCardField label="API type" value={resolvedModel?.api} />
        <ModelCardField
          label="Base URL"
          value={
            <span className="text-left break-all">{resolvedModel.baseUrl}</span>
          }
        />
        <ModelCardField
          label="Context window"
          value={formatTokenCount(resolvedModel.contextWindow)}
        />
        <ModelCardField
          label="Max tokens"
          value={formatTokenCount(resolvedModel.maxTokens)}
        />
        <ModelCardField
          label="Reasoning"
          value={<BoolValue value={resolvedModel.reasoning} />}
        />
        <ModelCardField
          label="Image input"
          value={<BoolValue value={supportsImageInput} />}
        />
        <ModelCardField
          label="Input cost"
          value={formatCostPerMillion(resolvedModel.cost.input)}
        />
        <ModelCardField
          label="Output cost"
          value={formatCostPerMillion(resolvedModel.cost.output)}
        />
      </main>
    </div>
  );
}
