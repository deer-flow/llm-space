"use client";

import type {
  ThreadCurrentDateVariable,
  ThreadVariable,
} from "@llm-space/core";
import {
  CalendarDaysIcon,
  PlusIcon,
  SparklesIcon,
  TypeIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Tooltip } from "@/components/tooltip";
import { useAutoAnimation } from "@/lib/use-auto-animation";
import { cn } from "@/lib/utils";

import { Button } from "../../ui/button";
import {
  DEFAULT_VARIABLE_VARIANT_NAME,
  normalizePromptVariableState,
  PROMPT_DATE_FORMATS,
} from "../prompt-variables";
import { useThreadStore } from "../stores";

import { SystemPromptVariablesDialog } from "./system-prompt-variables-dialog";
import type { PromptVariableSelection } from "./system-prompt-variables-panel";

type VariableListItem =
  | {
      kind: "builtIn";
      name: string;
      variable: ThreadVariable;
      status: string;
      warning?: boolean;
    }
  | {
      kind: "custom";
      name: string;
      value: string;
      status: string;
      warning?: boolean;
    };

export function SystemPromptVariablesListView({
  className,
  disabled,
}: {
  className?: string;
  disabled?: boolean;
}) {
  const rawVariables = useThreadStore((s) => s.thread.context?.variables);
  const rawVariableVariants = useThreadStore(
    (s) => s.thread.context?.variableVariants
  );
  const { variables, variableVariants } = useMemo(
    () =>
      normalizePromptVariableState({
        variables: rawVariables,
        variableVariants: rawVariableVariants,
      }),
    [rawVariableVariants, rawVariables]
  );
  const customValues =
    variableVariants.variants[DEFAULT_VARIABLE_VARIANT_NAME] ?? {};
  const items = useMemo<VariableListItem[]>(() => {
    const builtIns = Object.entries(variables).map(([name, variable]) => {
      if (variable.type === "currentDate") {
        return {
          kind: "builtIn" as const,
          name,
          variable,
          status: _dateFormatLabel(variable.format),
        };
      }
      return {
        kind: "builtIn" as const,
        name,
        variable,
        status:
          variable.skillNames.length === 0
            ? "All skills"
            : `${variable.skillNames.length} selected`,
      };
    });
    const custom = Object.entries(customValues).map(([name, value]) => ({
      kind: "custom" as const,
      name,
      value,
      status: value.trim() ? value : "(empty)",
    }));
    return [...builtIns, ...custom];
  }, [customValues, variables]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [initialSelection, setInitialSelection] =
    useState<PromptVariableSelection | null>(null);
  const [animationContainerRef] = useAutoAnimation({ duration: 150 });

  const openVariable = (item: VariableListItem) => {
    setInitialSelection({ kind: item.kind, name: item.name });
    setDialogOpen(true);
  };

  const openManage = () => {
    setInitialSelection(null);
    setDialogOpen(true);
  };

  return (
    <>
      <div
        ref={animationContainerRef}
        className={cn("group flex min-w-0 grow flex-wrap gap-2.5", className)}
      >
        {items.map((item) => (
          <VariableEntry
            key={`${item.kind}:${item.name}`}
            item={item}
            disabled={disabled}
            onOpen={openVariable}
          />
        ))}
        <Button
          className={cn(
            "-ml-1 px-0 transition-opacity hover:bg-transparent!",
            disabled ? "opacity-30!" : "opacity-50"
          )}
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={openManage}
        >
          <PlusIcon className="size-3" />
          Add
        </Button>
        <SystemPromptVariablesDialog
          open={dialogOpen}
          disabled={disabled}
          initialSelection={initialSelection}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setInitialSelection(null);
            }
          }}
        />
      </div>
    </>
  );
}

function VariableEntry({
  item,
  disabled,
  onOpen,
}: {
  item: VariableListItem;
  disabled?: boolean;
  onOpen: (item: VariableListItem) => void;
}) {
  const VariableIcon = _variableIcon(item);
  return (
    <div className="group/variable bg-secondary hover:text-accent-foreground inline-flex h-6 shrink-0 items-center rounded-md text-xs/relaxed transition-colors">
      <Tooltip
        content={
          <div>
            <div className="font-mono font-medium">{item.name}</div>
            <div
              className={cn(
                "text-muted-foreground max-w-64 truncate",
                item.warning && "text-orange-300"
              )}
            >
              {item.status}
            </div>
          </div>
        }
      >
        <span className="inline-flex h-full">
          <button
            type="button"
            className={cn(
              "focus-visible:ring-ring/30 text-muted-foreground group-hover/variable:text-foreground inline-flex h-full items-center gap-1 rounded-md px-2 outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50",
              item.warning &&
                "text-orange-300 group-hover/variable:text-orange-300"
            )}
            aria-label={`Manage ${item.name} variable`}
            disabled={disabled}
            onClick={() => onOpen(item)}
          >
            <VariableIcon className="size-3.5 shrink-0 opacity-70" />
            <span className="font-mono">{item.name}</span>
          </button>
        </span>
      </Tooltip>
    </div>
  );
}

function _variableIcon(item: VariableListItem) {
  if (item.kind === "custom") {
    return TypeIcon;
  }
  return item.variable.type === "currentDate" ? CalendarDaysIcon : SparklesIcon;
}

function _dateFormatLabel(value: ThreadCurrentDateVariable["format"]): string {
  return (
    PROMPT_DATE_FORMATS.find((format) => format.value === value)?.label ?? value
  );
}
