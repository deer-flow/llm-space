"use client";

import { type ReasoningLevel } from "@llm-space/core";
import { InfoIcon, SettingsIcon, SlidersHorizontal } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useFirstAvailableModel } from "@llm-space/ui/components/model-provider";
import { Tooltip } from "@llm-space/ui/components/tooltip";
import { useHostServices } from "@llm-space/ui/host";
import { cn } from "@llm-space/ui/lib/utils";
import { Button } from "@llm-space/ui/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@llm-space/ui/ui/hover-card";
import { Input } from "@llm-space/ui/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@llm-space/ui/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@llm-space/ui/ui/select";
import { Slider } from "@llm-space/ui/ui/slider";
import { Switch } from "@llm-space/ui/ui/switch";


import { useThreadStore, useThreadStoreActions } from "../stores/thread-store";

import { DEFAULT_JSON_SCHEMA, JsonSchemaDialog } from "./json-schema-dialog";
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
          aria-label={`${enabled ? "Disable" : "Enable"} ${label}`}
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
  // Fall back to the first available model when the thread has none saved yet;
  // `null` when there are no models to configure at all.
  const savedModel = useThreadStore((s) => s.thread.model);
  const fallbackModel = useFirstAvailableModel();
  const model = savedModel ?? fallbackModel;
  const { updateModelParams } = useThreadStoreActions();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const handleOpenChange = useCallback(
    (open: boolean) => {
      setPopoverOpen(open);
    },
    [setPopoverOpen]
  );

  const params = model?.params ?? {};
  const hasTemperature = params.temperature !== undefined;
  const hasReasoning = params.reasoning !== undefined;
  const hasMaxTokens = params.maxTokens !== undefined;

  const temperature = params.temperature ?? DEFAULT_TEMPERATURE;
  const reasoning = params.reasoning ?? DEFAULT_REASONING;
  const maxTokens = params.maxTokens;

  const responseType = params.responseType;
  const hasResponseFormat = responseType !== undefined;
  const responseFormat =
    responseType?.type === "json_schema" ? "json_schema" : "json_object";
  const responseSchema =
    responseType?.type === "json_schema" ? responseType.jsonSchema : undefined;
  const [schemaDialogOpen, setSchemaDialogOpen] = useState(false);

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

  const { actions } = useHostServices();
  const handleConfigModelSettings = useCallback(() => {
    setPopoverOpen(false);
    actions.openSettings("models");
  }, [setPopoverOpen, actions]);

  return (
    <div
      className={cn(
        cn(
          "flex shrink-0 gap-1 opacity-0 group-hover:opacity-100",
          popoverOpen && "opacity-100"
        ),
        readonly && "invisible"
      )}
    >
      <HoverCard>
        <HoverCardTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Show model details"
            disabled={!model}
          >
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
            <Button
              variant="ghost"
              disabled={readonly || !model}
              size="icon-xs"
              aria-label="Configure model parameters"
              aria-expanded={popoverOpen}
            >
              <SlidersHorizontal className="size-4" />
            </Button>
          </PopoverTrigger>
        </Tooltip>
        <PopoverContent align="end" className="flex w-72 flex-col p-4">
          <PopoverHeader>
            <PopoverTitle className="flex items-center justify-between">
              <div>Model settings</div>
              <div>
                <Tooltip content="Configure model settings">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Open model provider settings"
                    onClick={handleConfigModelSettings}
                  >
                    <SettingsIcon className="size-3.5" />
                  </Button>
                </Tooltip>
              </div>
            </PopoverTitle>
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
                aria-label="Temperature"
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
              aria-label="Max tokens"
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
              <SelectTrigger
                size="sm"
                className="mt-2 w-full"
                aria-label="Thinking effort"
              >
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

          <ParamField
            label="Response format"
            enabled={hasResponseFormat}
            readonly={readonly}
            onEnabledChange={(enabled) => {
              updateModelParams({
                responseType: enabled ? { type: "json_object" } : undefined,
              });
            }}
          >
            <Select
              value={responseFormat}
              disabled={readonly}
              onValueChange={(value) => {
                updateModelParams({
                  responseType:
                    value === "json_schema"
                      ? {
                          type: "json_schema",
                          jsonSchema: responseSchema ?? DEFAULT_JSON_SCHEMA,
                        }
                      : { type: "json_object" },
                });
              }}
            >
              <SelectTrigger
                size="sm"
                className="mt-2 w-full"
                aria-label="Response format"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="font-mono">
                <SelectItem value="json_object">JSON object</SelectItem>
                <SelectItem value="json_schema">JSON schema</SelectItem>
              </SelectContent>
            </Select>
            {responseFormat === "json_schema" ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                disabled={readonly}
                onClick={() => setSchemaDialogOpen(true)}
              >
                Edit schema
              </Button>
            ) : null}
          </ParamField>
        </PopoverContent>
      </Popover>
      {/* Rendered outside the Popover so the modal survives the popover closing
          when focus moves into the dialog. */}
      <JsonSchemaDialog
        open={schemaDialogOpen}
        onOpenChange={setSchemaDialogOpen}
        schema={responseSchema}
        onSave={(jsonSchema) => {
          updateModelParams({
            responseType: { type: "json_schema", jsonSchema },
          });
        }}
      />
    </div>
  );
}
