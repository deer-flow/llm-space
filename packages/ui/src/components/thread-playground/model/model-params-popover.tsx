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
import { formatString, useI18n } from "@llm-space/ui/lib/i18n";
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

const REASONING_LEVELS: ReasoningLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
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
  const { t } = useI18n();
  return (
    <div className={cn("border-t pt-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-sm", !enabled && "text-muted-foreground")}>
          {label}
        </span>
        <Switch
          size="sm"
          aria-label={formatString(
            enabled
              ? t.playground.model.disableParam
              : t.playground.model.enableParam,
            { label }
          )}
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
  const { t } = useI18n();
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
      className={cn("flex shrink-0 gap-1", readonly && "invisible")}
    >
      <HoverCard>
        <HoverCardTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t.playground.model.showModelDetails}
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
        <Tooltip content={t.playground.model.configureModelSettings}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              disabled={readonly || !model}
              size="icon-xs"
              aria-label={t.playground.model.configureModelParameters}
              aria-expanded={popoverOpen}
            >
              <SlidersHorizontal className="size-4" />
            </Button>
          </PopoverTrigger>
        </Tooltip>
        <PopoverContent align="end" className="flex w-72 flex-col p-4">
          <PopoverHeader>
            <PopoverTitle className="flex items-center justify-between">
              <div>{t.playground.model.modelSettings}</div>
              <div>
                <Tooltip content={t.playground.model.configureModelSettings}>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t.playground.model.openModelProviderSettings}
                    onClick={handleConfigModelSettings}
                  >
                    <SettingsIcon className="size-3.5" />
                  </Button>
                </Tooltip>
              </div>
            </PopoverTitle>
          </PopoverHeader>
          <ParamField
            label={t.playground.model.temperature}
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
                aria-label={t.playground.model.temperature}
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
            label={t.playground.model.maxTokens}
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
              aria-label={t.playground.model.maxTokens}
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
            label={t.playground.model.thinkingEffort}
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
                aria-label={t.playground.model.thinkingEffort}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="font-mono">
                {REASONING_LEVELS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t.playground.model.reasoningLevel[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ParamField>

          <ParamField
            label={t.playground.model.responseFormat}
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
                aria-label={t.playground.model.responseFormat}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="font-mono">
                <SelectItem value="json_object">
                  {t.playground.model.jsonObject}
                </SelectItem>
                <SelectItem value="json_schema">
                  {t.playground.model.jsonSchema}
                </SelectItem>
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
                {t.playground.model.editSchema}
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
