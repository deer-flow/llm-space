"use client";

import type {
  ThreadCurrentDateVariable,
  ThreadSkillsVariable,
  ThreadVariable,
} from "@llm-space/core";
import {
  DEFAULT_VARIABLE_VARIANT_NAME,
  formatCurrentDateVariable,
  formatSkillsVariable,
  normalizePromptVariableState,
  VARIABLE_NAME_RE,
} from "@llm-space/core/thread";
import {
  BracesIcon,
  CalendarDaysIcon,
  ListFilterIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/utils";
import type { SkillInfo } from "@/shared/skills";

import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { ScrollArea } from "../../ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { Textarea } from "../../ui/textarea";
import { useThreadStore, useThreadStoreActions } from "../stores";

import {
  PROMPT_DATE_FORMATS,
  PROMPT_SKILLS_FORMATS,
  PROMPT_SKILLS_INDENTS,
} from "./prompt-variable-options";
import { listEnabledPromptVariableSkills } from "./prompt-variable-skills";
import { SkillSelectionDialog } from "./skill-selection-dialog";

interface PromptVariablesPanelProps {
  className?: string;
  disabled?: boolean;
  initialSelection?: PromptVariableSelection | null;
}

export type PromptVariableSelection =
  { kind: "builtIn"; name: string } | { kind: "custom"; name: string };

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

function _PromptVariablesPanel({
  className,
  disabled,
  initialSelection,
}: PromptVariablesPanelProps) {
  const rawVariables = useThreadStore((s) => s.thread.context?.variables);
  const rawVariableVariants = useThreadStore(
    (s) => s.thread.context?.variableVariants
  );
  const systemPrompt = useThreadStore(
    (s) => s.thread.context?.systemPrompt ?? ""
  );
  const {
    updatePromptVariable,
    renamePromptVariable,
    addCustomVariable,
    updateCustomVariable,
    renameCustomVariable,
    removeCustomVariable,
  } = useThreadStoreActions();

  const { variables, variableVariants } = useMemo(
    () =>
      normalizePromptVariableState({
        variables: rawVariables,
        variableVariants: rawVariableVariants,
      }),
    [rawVariables, rawVariableVariants]
  );
  const customNames = useMemo(
    () =>
      _customVariableNames(
        variableVariants.variants[DEFAULT_VARIABLE_VARIANT_NAME] ?? {}
      ),
    [variableVariants]
  );
  const customValues =
    variableVariants.variants[DEFAULT_VARIABLE_VARIANT_NAME] ?? {};

  // Seed from the chip-open target so the fallback effect below (which runs in
  // the same mount commit) doesn't clobber it back to the first variable.
  const [selection, setSelection] = useState<PromptVariableSelection | null>(
    () =>
      initialSelection &&
      _selectionExists(initialSelection, variables, customValues)
        ? initialSelection
        : null
  );
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [pendingRemoveCustom, setPendingRemoveCustom] = useState<string | null>(
    null
  );
  const initialSelectionKey = initialSelection
    ? `${initialSelection.kind}:${initialSelection.name}`
    : null;
  const appliedInitialSelectionKeyRef = useRef<string | null>(null);

  const skillsByName = useMemo(
    () => new Map(skills.map((skill) => [skill.name, skill])),
    [skills]
  );

  const { builtInItems, customItems } = useMemo(() => {
    const builtInItems = Object.entries(variables).map(([name, variable]) => {
      if (variable.type === "currentDate") {
        return {
          kind: "builtIn" as const,
          name,
          variable,
          status: _dateFormatLabel(variable.format),
        };
      }
      const selectedCount = variable.skillNames.length;
      const missingCount = variable.skillNames.filter(
        (skillName) => !skillsByName.has(skillName)
      ).length;
      return {
        kind: "builtIn" as const,
        name,
        variable,
        status:
          selectedCount === 0
            ? "All skills"
            : missingCount > 0
              ? `${missingCount} missing`
              : `${selectedCount} selected`,
        warning: missingCount > 0 || Boolean(skillsError),
      };
    });
    const custom = Object.entries(customValues).map(([name, value]) => ({
      kind: "custom" as const,
      name,
      value,
      status: value.trim() ? value : "(empty)",
    }));
    return { builtInItems, customItems: custom };
  }, [customValues, skillsByName, skillsError, variables]);

  // Apply a chip-open target once, then let in-dialog selection stay user-owned
  // across variable edits.
  useEffect(() => {
    if (!initialSelectionKey) {
      appliedInitialSelectionKeyRef.current = null;
      return;
    }
    if (appliedInitialSelectionKeyRef.current === initialSelectionKey) {
      return;
    }
    appliedInitialSelectionKeyRef.current = initialSelectionKey;
    if (
      initialSelection &&
      _selectionExists(initialSelection, variables, customValues)
    ) {
      setSelection(initialSelection);
    }
  }, [customValues, initialSelection, initialSelectionKey, variables]);

  // Keep the selected detail stable across edits, but fall back when a selected
  // variable is removed.
  useEffect(() => {
    if (selection && _selectionExists(selection, variables, customValues)) {
      return;
    }
    const firstBuiltIn = Object.keys(variables)[0];
    if (firstBuiltIn) {
      setSelection({ kind: "builtIn", name: firstBuiltIn });
      return;
    }
    const firstCustom = Object.keys(customValues)[0];
    setSelection(firstCustom ? { kind: "custom", name: firstCustom } : null);
  }, [customValues, selection, variables]);

  useEffect(() => {
    let cancelled = false;
    setSkillsLoading(true);
    setSkillsError(null);
    void listEnabledPromptVariableSkills()
      .then((loaded) => {
        if (!cancelled) {
          setSkills(loaded);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSkills([]);
          setSkillsError(
            error instanceof Error ? error.message : "Failed to load skills."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSkillsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addCustom = useCallback(() => {
    const used = new Set([...Object.keys(variables), ...customNames]);
    const name = _uniqueName("custom_variable", used);
    if (addCustomVariable(name, "")) {
      setSelection({ kind: "custom", name });
    }
  }, [addCustomVariable, customNames, variables]);

  const confirmRemoveCustom = useCallback(
    (name: string) => {
      if (_promptContainsVariable(systemPrompt, name)) {
        setPendingRemoveCustom(name);
        return;
      }
      removeCustomVariable(name);
    },
    [removeCustomVariable, systemPrompt]
  );
  const detailFillsAvailableHeight =
    selection?.kind === "custom" ||
    (selection?.kind === "builtIn" &&
      variables[selection.name]?.type === "skills");

  return (
    <section
      className={cn(
        "bg-background/40 flex min-h-0 flex-col overflow-hidden",
        className
      )}
    >
      <div className="grid min-h-0 grow grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]">
        <ScrollArea className="border-border/60 min-h-0 border-r">
          <div className="grid gap-3 p-2">
            <VariableListGroup title="Built-in">
              {builtInItems.map((item) => (
                <VariableListRow
                  key={`${item.kind}:${item.name}`}
                  item={item}
                  selected={
                    selection?.kind === item.kind &&
                    selection.name === item.name
                  }
                  disabled={disabled}
                  onSelect={() =>
                    setSelection({ kind: item.kind, name: item.name })
                  }
                />
              ))}
            </VariableListGroup>
            <VariableListGroup
              title="Custom"
              action={
                <Button
                  className="h-6 px-1.5 text-[0.6875rem]"
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={addCustom}
                >
                  <PlusIcon className="size-3" />
                  Add variable
                </Button>
              }
            >
              {customItems.length > 0 ? (
                customItems.map((item) => (
                  <VariableListRow
                    key={`${item.kind}:${item.name}`}
                    item={item}
                    selected={
                      selection?.kind === item.kind &&
                      selection.name === item.name
                    }
                    disabled={disabled}
                    onSelect={() =>
                      setSelection({ kind: item.kind, name: item.name })
                    }
                  />
                ))
              ) : (
                <div className="text-muted-foreground px-2 py-1 text-[0.6875rem]">
                  No custom variables.
                </div>
              )}
            </VariableListGroup>
          </div>
        </ScrollArea>
        <ScrollArea
          className={cn(
            "min-h-0",
            detailFillsAvailableHeight &&
              "[&_[data-radix-scroll-area-viewport]>div]:!flex [&_[data-radix-scroll-area-viewport]>div]:!h-full"
          )}
        >
          <VariableDetail
            selection={selection}
            disabled={disabled}
            variables={variables}
            customNames={customNames}
            customValues={customValues}
            skills={skills}
            skillsByName={skillsByName}
            skillsLoading={skillsLoading}
            skillsError={skillsError}
            onRenameBuiltIn={(oldName, newName) => {
              const renamed = renamePromptVariable(oldName, newName);
              if (renamed) {
                setSelection({ kind: "builtIn", name: newName });
              }
              return renamed;
            }}
            onUpdateBuiltIn={updatePromptVariable}
            onRenameCustom={(oldName, newName) => {
              const renamed = renameCustomVariable(oldName, newName);
              if (renamed) {
                setSelection({ kind: "custom", name: newName });
              }
              return renamed;
            }}
            onUpdateCustom={updateCustomVariable}
            onRemoveCustom={confirmRemoveCustom}
          />
        </ScrollArea>
      </div>
      <ConfirmDialog
        open={pendingRemoveCustom !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRemoveCustom(null);
          }
        }}
        title="Delete custom variable?"
        description={
          pendingRemoveCustom
            ? `The system prompt references "{{${pendingRemoveCustom}}}". Deleting this variable will block runs until the prompt is updated.`
            : undefined
        }
        confirmLabel="Delete variable"
        onConfirm={() => {
          if (pendingRemoveCustom) {
            removeCustomVariable(pendingRemoveCustom);
          }
          setPendingRemoveCustom(null);
        }}
      />
    </section>
  );
}

function VariableListGroup({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <div className="text-muted-foreground flex min-h-6 items-center justify-between gap-2 px-1 text-[0.6875rem] font-medium tracking-wide uppercase">
        <span>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function VariableListRow({
  item,
  selected,
  disabled,
  onSelect,
}: {
  item: VariableListItem;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        "border-border/60 bg-muted/10 flex min-w-0 items-center gap-1 rounded-md border transition-colors",
        selected && "border-primary/50 bg-primary/10",
        item.warning && !selected && "border-destructive/30"
      )}
    >
      <button
        type="button"
        className="hover:bg-muted/40 focus-visible:ring-ring/30 flex min-w-0 grow items-center gap-2 rounded-md px-2 py-1 text-left transition-colors outline-none focus-visible:ring-2"
        disabled={disabled}
        aria-pressed={selected}
        onClick={onSelect}
      >
        {_variableIcon(item)}
        <span className="min-w-0 grow">
          <span className="block truncate text-xs font-medium">
            {`${item.name}`}
          </span>
          <span
            className={cn(
              "text-muted-foreground block truncate text-[0.6875rem]",
              item.warning && "text-destructive"
            )}
          >
            {item.status}
          </span>
        </span>
      </button>
    </div>
  );
}

function VariableDetail({
  selection,
  disabled,
  variables,
  customNames,
  customValues,
  skills,
  skillsByName,
  skillsLoading,
  skillsError,
  onRenameBuiltIn,
  onUpdateBuiltIn,
  onRenameCustom,
  onUpdateCustom,
  onRemoveCustom,
}: {
  selection: PromptVariableSelection | null;
  disabled?: boolean;
  variables: Record<string, ThreadVariable>;
  customNames: Set<string>;
  customValues: Record<string, string>;
  skills: SkillInfo[];
  skillsByName: Map<string, SkillInfo>;
  skillsLoading: boolean;
  skillsError: string | null;
  onRenameBuiltIn: (oldName: string, newName: string) => boolean;
  onUpdateBuiltIn: (name: string, variable: ThreadVariable) => void;
  onRenameCustom: (oldName: string, newName: string) => boolean;
  onUpdateCustom: (name: string, value: string) => void;
  onRemoveCustom: (name: string) => void;
}) {
  if (!selection) {
    return (
      <div className="text-muted-foreground p-3 text-xs">
        Add a custom variable to provide a reusable value.
      </div>
    );
  }

  if (selection.kind === "custom") {
    const value = customValues[selection.name];
    if (value === undefined) {
      return (
        <div className="text-muted-foreground p-3 text-xs">
          Select a variable to edit.
        </div>
      );
    }
    return (
      <CustomVariableDetail
        name={selection.name}
        value={value}
        disabled={disabled}
        variables={variables}
        customNames={customNames}
        onRename={onRenameCustom}
        onUpdate={onUpdateCustom}
        onRemove={onRemoveCustom}
      />
    );
  }

  const variable = variables[selection.name];
  if (!variable) {
    return (
      <div className="text-muted-foreground p-3 text-xs">
        Select a variable to edit.
      </div>
    );
  }

  if (variable.type === "currentDate") {
    return (
      <CurrentDateVariableDetail
        name={selection.name}
        variable={variable}
        disabled={disabled}
        variables={variables}
        customNames={customNames}
        onRename={onRenameBuiltIn}
        onUpdate={(name, next) => onUpdateBuiltIn(name, next)}
      />
    );
  }

  return (
    <SkillsVariableDetail
      name={selection.name}
      variable={variable}
      disabled={disabled}
      variables={variables}
      customNames={customNames}
      skills={skills}
      skillsByName={skillsByName}
      skillsLoading={skillsLoading}
      skillsError={skillsError}
      onRename={onRenameBuiltIn}
      onUpdate={(name, next) => onUpdateBuiltIn(name, next)}
    />
  );
}

function CurrentDateVariableDetail({
  name,
  variable,
  disabled,
  variables,
  customNames,
  onRename,
  onUpdate,
}: {
  name: string;
  variable: ThreadCurrentDateVariable;
  disabled?: boolean;
  variables: Record<string, ThreadVariable>;
  customNames: Set<string>;
  onRename: (oldName: string, newName: string) => boolean;
  onUpdate: (name: string, variable: ThreadCurrentDateVariable) => void;
}) {
  return (
    <DetailShell
      icon={<CalendarDaysIcon className="text-muted-foreground size-4" />}
      title="Current date"
      disabled={disabled}
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <Field label="Name">
          <VariableNameInput
            name={name}
            disabled={disabled}
            isAvailable={(next) =>
              _isBuiltInNameAvailable(next, name, variables, customNames)
            }
            onCommit={(next) => onRename(name, next)}
          />
        </Field>
        <Field label="Format">
          <Select
            value={variable.format}
            disabled={disabled}
            onValueChange={(format: ThreadCurrentDateVariable["format"]) =>
              onUpdate(name, { ...variable, format })
            }
          >
            <SelectTrigger className="w-full" aria-label="Current date format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROMPT_DATE_FORMATS.map((format) => (
                <SelectItem key={format.value} value={format.value}>
                  {format.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Value">
        <PreviewBlock value={formatCurrentDateVariable(variable.format)} />
      </Field>
    </DetailShell>
  );
}

function SkillsVariableDetail({
  name,
  variable,
  disabled,
  variables,
  customNames,
  skills,
  skillsByName,
  skillsLoading,
  skillsError,
  onRename,
  onUpdate,
}: {
  name: string;
  variable: ThreadSkillsVariable;
  disabled?: boolean;
  variables: Record<string, ThreadVariable>;
  customNames: Set<string>;
  skills: SkillInfo[];
  skillsByName: Map<string, SkillInfo>;
  skillsLoading: boolean;
  skillsError: string | null;
  onRename: (oldName: string, newName: string) => boolean;
  onUpdate: (name: string, variable: ThreadSkillsVariable) => void;
}) {
  const [skillsDialogOpen, setSkillsDialogOpen] = useState(false);
  const selectedSkills = variable.skillNames.flatMap((skillName) => {
    const skill = skillsByName.get(skillName);
    return skill ? [skill] : [];
  });
  // Empty selection means "all enabled skills".
  const usingAllSkills = variable.skillNames.length === 0;
  const someMissing =
    !usingAllSkills && selectedSkills.length !== variable.skillNames.length;
  const preview =
    skillsError ??
    (someMissing
      ? "Some selected skills are no longer enabled."
      : formatSkillsVariable(
          usingAllSkills ? skills : selectedSkills,
          variable
        ));

  const update = (next: Partial<ThreadSkillsVariable>) => {
    onUpdate(name, { ...variable, ...next });
  };

  return (
    <DetailShell
      icon={<SparklesIcon className="text-muted-foreground size-4" />}
      title="Available skills"
      disabled={disabled}
      action={
        <Tooltip content="Select skills">
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Select skills"
            disabled={disabled}
            onClick={() => setSkillsDialogOpen(true)}
          >
            <ListFilterIcon className="size-3.5" />
          </Button>
        </Tooltip>
      }
      className="flex h-full flex-col"
      contentClassName="flex min-h-0 grow flex-col"
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem_9rem]">
        <Field label="Name">
          <VariableNameInput
            name={name}
            disabled={disabled}
            isAvailable={(next) =>
              _isBuiltInNameAvailable(next, name, variables, customNames)
            }
            onCommit={(next) => onRename(name, next)}
          />
        </Field>
        <Field label="Format">
          <Select
            value={variable.format}
            disabled={disabled}
            onValueChange={(format: ThreadSkillsVariable["format"]) =>
              update({ format })
            }
          >
            <SelectTrigger className="w-full" aria-label="Skills format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROMPT_SKILLS_FORMATS.map((format) => (
                <SelectItem key={format.value} value={format.value}>
                  {format.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Indent">
          <Select
            value={String(variable.indent)}
            disabled={disabled}
            onValueChange={(indent) => update({ indent: Number(indent) })}
          >
            <SelectTrigger className="w-full" aria-label="Skills indentation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROMPT_SKILLS_INDENTS.map((indent) => (
                <SelectItem key={indent} value={String(indent)}>
                  {indent === 0 ? "Default" : `${indent} spaces`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Value" className="flex min-h-0 grow flex-col">
        <PreviewBlock
          className="max-h-none min-h-32 grow"
          muted={skillsLoading || Boolean(skillsError) || someMissing}
          value={skillsLoading ? "Loading skills..." : preview}
        />
      </Field>
      <SkillSelectionDialog
        open={skillsDialogOpen}
        disabled={disabled}
        loading={skillsLoading}
        error={skillsError}
        skills={skills}
        selectedSkillNames={variable.skillNames}
        onOpenChange={setSkillsDialogOpen}
        onApply={(skillNames) => update({ skillNames })}
      />
    </DetailShell>
  );
}

function CustomVariableDetail({
  name,
  value,
  disabled,
  variables,
  customNames,
  onRename,
  onUpdate,
  onRemove,
}: {
  name: string;
  value: string;
  disabled?: boolean;
  variables: Record<string, ThreadVariable>;
  customNames: Set<string>;
  onRename: (oldName: string, newName: string) => boolean;
  onUpdate: (name: string, value: string) => void;
  onRemove: (name: string) => void;
}) {
  return (
    <DetailShell
      icon={<BracesIcon className="text-muted-foreground size-4" />}
      title="User defined variable"
      disabled={disabled}
      action={
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Delete custom variable"
          disabled={disabled}
          onClick={() => onRemove(name)}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      }
      className="flex h-full flex-col"
      contentClassName="flex min-h-0 grow flex-col"
    >
      <Field label="Name">
        <VariableNameInput
          name={name}
          disabled={disabled}
          isAvailable={(next) =>
            _isCustomNameAvailable(next, name, variables, customNames)
          }
          onCommit={(next) => onRename(name, next)}
        />
      </Field>
      <Field label="Value" className="flex min-h-0 grow flex-col">
        <Textarea
          className="min-h-32 grow resize-none font-mono text-xs"
          value={value}
          disabled={disabled}
          placeholder="Variable value"
          onChange={(event) => onUpdate(name, event.currentTarget.value)}
        />
      </Field>
    </DetailShell>
  );
}

function DetailShell({
  icon,
  title,
  action,
  children,
  className,
  contentClassName,
}: {
  icon: ReactNode;
  title: string;
  disabled?: boolean;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={cn("grid w-full gap-5 p-5", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon}
        <div className="min-w-0 grow">
          <div className="truncate text-base font-medium">{title}</div>
        </div>
        {action}
      </div>
      <div className={cn("grid gap-4", contentClassName)}>{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("grid min-w-0 gap-1.5", className)}>
      <span className="text-muted-foreground text-xs">{label}</span>
      {children}
    </label>
  );
}

function PreviewBlock({
  value,
  muted,
  className,
}: {
  value: string;
  muted?: boolean;
  className?: string;
}) {
  return (
    <pre
      className={cn(
        "bg-muted/30 text-foreground/80 max-h-28 overflow-auto rounded-md border px-2 py-1.5 font-mono text-xs whitespace-pre-wrap",
        muted && "text-muted-foreground",
        className
      )}
    >
      {value}
    </pre>
  );
}

function VariableNameInput({
  name,
  disabled,
  className,
  ariaLabel,
  showFeedback = true,
  isAvailable,
  onCommit,
}: {
  name: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  showFeedback?: boolean;
  isAvailable: (name: string) => boolean;
  onCommit: (name: string) => boolean;
}) {
  const [draft, setDraft] = useState(name);
  useEffect(() => {
    setDraft(name);
  }, [name]);
  const trimmedDraft = draft.trim();
  const valid = _isNameAvailable(trimmedDraft);
  const available = trimmedDraft === name || isAvailable(trimmedDraft);
  const commit = () => {
    const next = trimmedDraft;
    if (next === name) {
      setDraft(name);
      return;
    }
    if (!valid || !available || !onCommit(next)) {
      setDraft(name);
      return;
    }
    setDraft(next);
  };
  return (
    <div className={cn("grid gap-1", className)}>
      <Input
        className={cn(
          "h-7 font-mono text-xs",
          !showFeedback && "h-7",
          (!valid || !available) && "border-destructive"
        )}
        value={draft}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={!valid || !available}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            setDraft(name);
            event.currentTarget.blur();
          }
        }}
      />
      {showFeedback && !valid ? (
        <div className="text-destructive text-xs">
          Use letters, numbers, and underscores; start with a letter or
          underscore.
        </div>
      ) : showFeedback && !available ? (
        <div className="text-destructive text-xs">Name already exists.</div>
      ) : null}
    </div>
  );
}

function _variableIcon(item: VariableListItem): ReactNode {
  if (item.kind === "custom") {
    return <BracesIcon className="text-muted-foreground size-4 shrink-0" />;
  }
  if (item.variable.type === "currentDate") {
    return (
      <CalendarDaysIcon className="text-muted-foreground size-4 shrink-0" />
    );
  }
  return <SparklesIcon className="text-muted-foreground size-4 shrink-0" />;
}

function _dateFormatLabel(value: ThreadCurrentDateVariable["format"]): string {
  return (
    PROMPT_DATE_FORMATS.find((format) => format.value === value)?.label ?? value
  );
}

function _selectionExists(
  selection: PromptVariableSelection,
  variables: Record<string, ThreadVariable>,
  customValues: Record<string, string>
): boolean {
  if (selection.kind === "builtIn") {
    return Object.prototype.hasOwnProperty.call(variables, selection.name);
  }
  return Object.prototype.hasOwnProperty.call(customValues, selection.name);
}

function _customVariableNames(values: Record<string, string>): Set<string> {
  return new Set(Object.keys(values));
}

function _isNameAvailable(name: string): boolean {
  return VARIABLE_NAME_RE.test(name);
}

function _isBuiltInNameAvailable(
  name: string,
  currentName: string,
  variables: Record<string, ThreadVariable>,
  customNames: Set<string>
): boolean {
  return (
    _isNameAvailable(name) &&
    (name === currentName ||
      (!Object.prototype.hasOwnProperty.call(variables, name) &&
        !customNames.has(name)))
  );
}

function _isCustomNameAvailable(
  name: string,
  currentName: string,
  variables: Record<string, ThreadVariable>,
  customNames: Set<string>
): boolean {
  return (
    _isNameAvailable(name) &&
    !Object.prototype.hasOwnProperty.call(variables, name) &&
    (name === currentName || !customNames.has(name))
  );
}

function _promptContainsVariable(systemPrompt: string, name: string): boolean {
  const re = new RegExp(`\\{\\{\\s*${_escapeRegExp(name)}\\s*\\}\\}`);
  return re.test(systemPrompt);
}

function _uniqueName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    return base;
  }
  let index = 2;
  while (used.has(`${base}_${index}`)) {
    index += 1;
  }
  return `${base}_${index}`;
}

function _escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const PromptVariablesPanel = memo(_PromptVariablesPanel);
