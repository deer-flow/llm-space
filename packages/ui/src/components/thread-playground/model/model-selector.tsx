"use client";

import { type ModelConfig } from "@llm-space/core";
import { SettingsIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useHostServices } from "@llm-space/ui/host";
import { cn } from "@llm-space/ui/lib/utils";
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
  ComboboxSeparator,
} from "@llm-space/ui/ui/combobox";

import { useModels, useRefreshModels } from "../../model-provider";
import { ModelAvatar } from "../model-avatar";
import { ProviderAvatar } from "../provider-avatar";
import { useThreadStoreActions } from "../stores";

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
  value: ModelConfig | null;
  readonly?: boolean;

  onOpenChange?: (open: boolean) => void;
}) {
  const providers = useModels();
  const refreshModels = useRefreshModels();
  const { updateModel } = useThreadStoreActions();
  const { actions } = useHostServices();
  const [open, setOpen] = useState(false);

  const items = useMemo(
    () =>
      [...providers]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((group) => {
          const disabled = new Set(group.disabledModels ?? []);
          return {
            id: group.id,
            name: group.name,
            icon: group.icon,
            items: group.models
              .filter((model) => !disabled.has(model.id))
              .map((model) => toModelKey(model)),
          };
        })
        .filter((group) => group.items.length > 0),
    [providers]
  );

  const modelMeta = useMemo(() => {
    const meta = new Map<string, { id: string; name: string; icon?: string }>();
    for (const group of providers) {
      for (const model of group.models) {
        meta.set(toModelKey(model), {
          id: model.id,
          name: model.name,
          icon: model.icon,
        });
      }
    }
    return meta;
  }, [providers]);

  const inputRef = useRef<HTMLInputElement>(null);
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen) {
        // Always read fresh from the main process on open — never cache.
        void refreshModels();
      } else {
        inputRef.current?.blur();
      }
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, refreshModels]
  );

  const configureModels = useCallback(() => {
    handleOpenChange(false);
    actions.openSettings("models");
  }, [actions, handleOpenChange]);

  const filterItems = useCallback(
    (itemValue: string, query: string) => {
      const label = modelMeta.get(itemValue)?.name ?? itemValue;
      return label.toLocaleLowerCase().includes(query.toLocaleLowerCase());
    },
    [modelMeta]
  );

  const selectedValue = value ? toModelKey(value) : "";

  useEffect(() => {
    const trigger = inputRef.current
      ?.closest<HTMLElement>('[data-slot="input-group"]')
      ?.querySelector<HTMLElement>('[data-slot="input-group-button"]');
    trigger?.setAttribute("aria-label", "Open model selector");
  }, []);

  return (
    <Combobox
      items={items}
      value={selectedValue}
      disabled={readonly}
      itemToStringLabel={(itemValue) =>
        modelMeta.get(itemValue)?.name ?? itemValue
      }
      filter={filterItems}
      open={open}
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
        aria-label="Model selector"
        className={cn(
          "hover:bg-secondary! group/model-select h-6! w-75 border-0 bg-transparent! font-mono",
          !readonly && "cursor:pointer hover:bg-secondary"
        )}
        triggerClassName="opacity-0! group-hover/model-select:opacity-100"
        placeholder="(No model selected)"
        disabled={readonly}
      />
      <ComboboxContent className="w-96">
        <ComboboxEmpty>No models found.</ComboboxEmpty>
        <ComboboxList>
          {(provider: {
            id: string;
            name: string;
            icon?: string;
            items: string[];
          }) => (
            <ComboboxGroup
              className="mb-2"
              key={provider.name}
              items={provider.items}
            >
              <ComboboxLabel className="flex items-center gap-1.5">
                <ProviderAvatar
                  id={provider.id}
                  name={provider.name}
                  icon={provider.icon}
                  size={14}
                />
                {provider.name}
              </ComboboxLabel>
              <ComboboxCollection>
                {(modelKey: string) => {
                  const meta = modelMeta.get(modelKey);
                  return (
                    <ComboboxItem
                      className="flex items-center gap-2 pl-4"
                      key={modelKey}
                      value={modelKey}
                    >
                      <ModelAvatar
                        id={meta?.id ?? modelKey}
                        name={meta?.name ?? modelKey}
                        icon={meta?.icon}
                        size={16}
                      />
                      {meta?.name ?? modelKey}
                    </ComboboxItem>
                  );
                }}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
        <ComboboxSeparator className="mx-1 my-0" />
        <div className="w-full p-1">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={configureModels}
            className="hover:bg-accent hover:text-accent-foreground text-muted-foreground flex min-h-7 w-full cursor-default items-center gap-2 rounded-md px-2 py-1 text-xs/relaxed outline-hidden select-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5"
          >
            <SettingsIcon />
            Configure models...
          </button>
        </div>
      </ComboboxContent>
    </Combobox>
  );
}
