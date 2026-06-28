"use client";

import { type ModelConfig } from "@llm-space/core";
import { useCallback, useMemo, useRef } from "react";

import { useModels } from "@/components/model-provider";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { useThreadStoreActions } from "@/stores/thread-store";

function toModelKey(model: Pick<ModelConfig, "id" | "provider">) {
  return `${model.provider}:${model.id}`;
}

function parseModelKey(key: string) {
  const separatorIndex = key.indexOf(":");
  if (separatorIndex === -1) {
    return null;
  }
  return {
    provider: key.slice(0, separatorIndex),
    id: key.slice(separatorIndex + 1),
  };
}

export function ModelSelector({
  value,
  readonly,
  onOpenChange,
}: {
  value: ModelConfig;
  readonly?: boolean;
  // eslint-disable-next-line no-unused-vars
  onOpenChange?: (open: boolean) => void;
}) {
  const providers = useModels();
  const { updateModel } = useThreadStoreActions();

  const items = useMemo(
    () =>
      providers.map((group) => ({
        name: group.name,
        items: group.models.map((model) => toModelKey(model)),
      })),
    [providers]
  );

  const modelLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const group of providers) {
      for (const model of group.models) {
        labels.set(toModelKey(model), model.name);
      }
    }
    return labels;
  }, [providers]);

  const inputRef = useRef<HTMLInputElement>(null);
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        inputRef.current?.blur();
      }
      onOpenChange?.(open);
    },
    [onOpenChange]
  );

  const selectedValue = toModelKey(value);

  return (
    <Combobox
      items={items}
      value={selectedValue}
      disabled={readonly}
      itemToStringLabel={(itemValue) => modelLabels.get(itemValue) ?? itemValue}
      filter={(itemValue: string, query) => {
        const label = modelLabels.get(itemValue) ?? itemValue;
        return label.toLocaleLowerCase().includes(query.toLocaleLowerCase());
      }}
      onOpenChange={handleOpenChange}
      onValueChange={(nextValue) => {
        if (!nextValue || readonly) {
          return;
        }
        const parsed = parseModelKey(nextValue);
        if (!parsed) {
          return;
        }
        updateModel(parsed);
      }}
    >
      <ComboboxInput
        ref={inputRef}
        className={cn(
          "bg-transparent! h-6! hover:bg-secondary! group/model-select w-75 border-0 font-mono",
          !readonly && "cursor:pointer hover:bg-secondary"
        )}
        triggerClassName="opacity-0 group-hover/model-select:opacity-100"
        placeholder="Select a model"
        disabled={readonly}
      />
      <ComboboxContent className="w-96">
        <ComboboxEmpty>No models found.</ComboboxEmpty>
        <ComboboxList>
          {(provider: { name: string; items: string[] }) => (
            <ComboboxGroup
              className="mb-2"
              key={provider.name}
              items={provider.items}
            >
              <ComboboxLabel>{provider.name}</ComboboxLabel>
              <ComboboxCollection>
                {(modelKey: string) => (
                  <ComboboxItem
                    className="pl-4"
                    key={modelKey}
                    value={modelKey}
                  >
                    {modelLabels.get(modelKey) ?? modelKey}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
