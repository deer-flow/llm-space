"use client";

import { type ReasoningLevel } from "@llm-space/core";
import { InfoIcon, SlidersHorizontal } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { useThreadStore, useThreadStoreActions } from "@/stores/thread-store";

import { Tooltip } from "../../tooltip";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "../../ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { Slider } from "../../ui/slider";
import { Switch } from "../../ui/switch";

import { ModelCard } from "./model-card";

const REASONING_LEVELS: { value: ReasoningLevel; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "X-High" },
];

const DEFAULT_TEMPERATURE = 1;
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_REASONING: ReasoningLevel = "medium";

function ParamField({
  className,
  label,
  enabled,
  readonly,
  onEnabledChange,
  children,
}: {
  className?: string;
  label: string;
  enabled: boolean;
  readonly?: boolean;
  // eslint-disable-next-line no-unused-vars
  onEnabledChange: (enabled: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className={cn("border-t pt-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-sm", !enabled && "text-muted-foreground")}>
          {label}
        </span>
        <Switch
          size="sm"
          checked={enabled}
          disabled={readonly}
          onCheckedChange={onEnabledChange}
        />
      </div>
      {enabled ? children : null}
    </div>
  );
}

export function ModelParamsPopover({
  readonly,
  maxTokens: maxTokensFromProps,
}: {
  readonly?: boolean;
  maxTokens?: number;
}) {
  const model = useThreadStore((s) => s.thread.model);
  const { updateModelParams } = useThreadStoreActions();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const handleOpenChange = useCallback(
    (open: boolean) => {
      setPopoverOpen(open);
    },
    [setPopoverOpen]
  );

  const params = model.params ?? {};
  const hasTemperature = params.temperature !== undefined;
  const hasReasoning = params.reasoning !== undefined;
  const hasMaxTokens = params.maxTokens !== undefined;

  const temperature = params.temperature ?? DEFAULT_TEMPERATURE;
  const reasoning = params.reasoning ?? DEFAULT_REASONING;
  const maxTokens = params.maxTokens;

  const [draftMaxTokens, setDraftMaxTokens] = useState(
    maxTokens !== undefined ? String(maxTokens) : ""
  );
  const isMaxTokensFocusedRef = useRef(false);

  useEffect(() => {
    if (!isMaxTokensFocusedRef.current) {
      setDraftMaxTokens(maxTokens !== undefined ? String(maxTokens) : "");
    }
  }, [maxTokens]);

  const commitMaxTokens = useCallback(() => {
    const committed = maxTokens !== undefined ? String(maxTokens) : "";
    if (draftMaxTokens !== committed) {
      updateModelParams({
        maxTokens: draftMaxTokens === "" ? undefined : Number(draftMaxTokens),
      });
    }
  }, [draftMaxTokens, maxTokens, updateModelParams]);

  return (
    <div
      className={cn(
        cn(
          "flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100",
          popoverOpen && "opacity-100"
        ),
        readonly && "invisible"
      )}
    >
      <HoverCard>
        <HoverCardTrigger asChild>
          <Button variant="ghost" size="icon-xs">
            <InfoIcon className="size-4" />
          </Button>
        </HoverCardTrigger>
        <HoverCardContent>
          <ModelCard model={model} />
        </HoverCardContent>
      </HoverCard>
      <Popover onOpenChange={handleOpenChange}>
        <Tooltip content="Configure model settings">
          <PopoverTrigger asChild>
            <Button variant="ghost" disabled={readonly} size="icon-xs">
              <SlidersHorizontal className="size-4" />
            </Button>
          </PopoverTrigger>
        </Tooltip>
        <PopoverContent align="end" className="flex w-72 flex-col p-4">
          <PopoverHeader>
            <PopoverTitle>Model settings</PopoverTitle>
          </PopoverHeader>
          <ParamField
            label="Temperature"
            enabled={hasTemperature}
            readonly={readonly}
            onEnabledChange={(enabled) => {
              updateModelParams({
                temperature: enabled ? DEFAULT_TEMPERATURE : undefined,
              });
            }}
          >
            <div className="space-y-2 pt-2">
              <div className="flex justify-end">
                <span className="text-muted-foreground font-mono tabular-nums">
                  {temperature}
                </span>
              </div>
              <Slider
                min={0}
                max={2}
                step={0.1}
                value={[temperature]}
                disabled={readonly}
                onValueChange={([value]) => {
                  if (value !== undefined) {
                    updateModelParams({ temperature: value });
                  }
                }}
              />
            </div>
          </ParamField>

          <ParamField
            label="Max tokens"
            enabled={hasMaxTokens}
            readonly={readonly}
            onEnabledChange={(enabled) => {
              updateModelParams({
                maxTokens: enabled ? DEFAULT_MAX_TOKENS : undefined,
              });
            }}
          >
            <Input
              className="mt-2 w-full font-mono"
              type="number"
              min={1}
              max={maxTokensFromProps}
              value={draftMaxTokens}
              disabled={readonly}
              onChange={(event) => {
                setDraftMaxTokens(event.target.value);
              }}
              onFocus={() => {
                isMaxTokensFocusedRef.current = true;
              }}
              onBlur={() => {
                isMaxTokensFocusedRef.current = false;
                commitMaxTokens();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
          </ParamField>

          <ParamField
            label="Thinking effort"
            enabled={hasReasoning}
            readonly={readonly}
            onEnabledChange={(enabled) => {
              updateModelParams({
                reasoning: enabled ? DEFAULT_REASONING : undefined,
              });
            }}
          >
            <Select
              value={reasoning}
              disabled={readonly}
              onValueChange={(value) => {
                updateModelParams({ reasoning: value as ReasoningLevel });
              }}
            >
              <SelectTrigger size="sm" className="mt-2 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="font-mono">
                {REASONING_LEVELS.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ParamField>
        </PopoverContent>
      </Popover>
    </div>
  );
}
