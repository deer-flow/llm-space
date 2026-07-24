"use client";

import type {
  ThreadCurrentDateVariable,
  ThreadFileVariable,
  ThreadJsonVariable,
  ThreadSkillsVariable,
  ThreadVariable,
  ThreadWorkingDirectoryVariable,
} from "@llm-space/core";
import type { SkillInfo } from "@llm-space/core";
import {
  DEFAULT_VARIABLE_VARIANT_NAME,
  formatCurrentDateVariable,
  formatSkillsVariable,
  hasThreadPromptVariableReference,
  includesAllSkills,
  normalizePromptVariableState,
  VARIABLE_NAME_RE,
} from "@llm-space/core/thread";
import {
  BracesIcon,
  CalendarDaysIcon,
  FileTextIcon,
  FolderOpenIcon,
  ListFilterIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  TriangleAlertIcon,
  TypeIcon,
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

import { CodeEditor } from "@llm-space/ui/components/code-editor";
import { ConfirmDialog } from "@llm-space/ui/components/confirm-dialog";
import { Tooltip } from "@llm-space/ui/components/tooltip";
import { useHostServices } from "@llm-space/ui/host";
import { cn } from "@llm-space/ui/lib/utils";
import { Button } from "@llm-space/ui/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@llm-space/ui/ui/dropdown-menu";
import { Input } from "@llm-space/ui/ui/input";
import { ScrollArea } from "@llm-space/ui/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@llm-space/ui/ui/select";

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
  const { skills: skillsHost } = useHostServices();
  const rawVariables = useThreadStore((s) => s.thread.context?.variables);
  const rawVariableVariants = useThreadStore(
    (s) => s.thread.context?.variableVariants
  );
  const systemPrompt = useThreadStore(
    (s) => s.thread.context?.systemPrompt ?? ""
  );
  const messages = useThreadStore((s) => s.thread.context?.messages);
  const {
    updatePromptVariable,
    removePromptVariable,
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
  const customValues = useMemo(
    () => variableVariants.variants[DEFAULT_VARIABLE_VARIANT_NAME] ?? {},
    [variableVariants]
  );

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
  const [pendingRemove, setPendingRemove] = useState<{
    name: string;
    hasReferences: boolean;
    onConfirm: () => void;
  } | null>(null);
  const initialSelectionKey = initialSelection
    ? `${initialSelection.kind}:${initialSelection.name}`
    : null;
  const appliedInitialSelectionKeyRef = useRef<string | null>(null);

  const skillsByName = useMemo(
    () => new Map(skills.map((skill) => [skill.name, skill])),
    [skills]
  );

  const { builtInItems, typedItems, customItems } = useMemo(() => {
    const builtInItems: VariableListItem[] = [];
    const typedItems: VariableListItem[] = [];
    for (const [name, variable] of Object.entries(variables)) {
      if (variable.type === "currentDate") {
        builtInItems.push({
          kind: "builtIn",
          name,
          variable,
          status: _dateFormatLabel(variable.format),
        });
        continue;
      }
      if (variable.type === "workingDirectory") {
        builtInItems.push({
          kind: "builtIn",
          name,
          variable,
          status: variable.value.trim() || "(empty)",
        });
        continue;
      }
      if (variable.type === "json") {
        typedItems.push({
          kind: "builtIn",
          name,
          variable,
          status: _jsonStatus(variable.value),
        });
        continue;
      }
      if (variable.type === "file") {
        typedItems.push({
          kind: "builtIn",
          name,
          variable,
          status: variable.value.trim() || "(no file)",
        });
        continue;
      }
      const selectedCount = variable.skillNames.length;
      const missingCount = variable.skillNames.filter(
        (skillName) => !skillsByName.has(skillName)
      ).length;
      builtInItems.push({
        kind: "builtIn",
        name,
        variable,
        status: includesAllSkills(variable)
          ? "All skills"
          : selectedCount === 0
            ? "None selected"
            : missingCount > 0
              ? `${missingCount} missing`
              : `${selectedCount} selected`,
        warning: missingCount > 0 || Boolean(skillsError),
      });
    }
    const custom: VariableListItem[] = Object.entries(customValues).map(
      ([name, value]) => ({
        kind: "custom",
        name,
        value,
        status: value.trim() ? value : "(empty)",
      })
    );
    return { builtInItems, typedItems, customItems: custom };
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
    void listEnabledPromptVariableSkills(skillsHost)
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
  }, [skillsHost]);

  const addCustom = useCallback(() => {
    const used = new Set([...Object.keys(variables), ...customNames]);
    const name = _uniqueName("custom_variable", used);
    if (addCustomVariable(name, "")) {
      setSelection({ kind: "custom", name });
    }
  }, [addCustomVariable, customNames, variables]);

  const addJson = useCallback(() => {
    const used = new Set([...Object.keys(variables), ...customNames]);
    const name = _uniqueName("json_variable", used);
    updatePromptVariable(name, { type: "json", value: "" });
    setSelection({ kind: "builtIn", name });
  }, [customNames, updatePromptVariable, variables]);

  const addFile = useCallback(() => {
    const used = new Set([...Object.keys(variables), ...customNames]);
    const name = _uniqueName("file_variable", used);
    updatePromptVariable(name, { type: "file", value: "" });
    setSelection({ kind: "builtIn", name });
  }, [customNames, updatePromptVariable, variables]);

  const confirmRemoveCustom = useCallback(
    (name: string) => {
      setPendingRemove({
        name,
        hasReferences: hasThreadPromptVariableReference(
          { systemPrompt, messages },
          name
        ),
        onConfirm: () => removeCustomVariable(name),
      });
    },
    [messages, removeCustomVariable, systemPrompt]
  );

  // Removes any user-created typed variable (json / file) from context.variables.
  const confirmRemoveTypedVariable = useCallback(
    (name: string) => {
      setPendingRemove({
        name,
        hasReferences: hasThreadPromptVariableReference(
          { systemPrompt, messages },
          name
        ),
        onConfirm: () => removePromptVariable(name),
      });
    },
    [messages, removePromptVariable, systemPrompt]
  );
  const selectedType =
    selection?.kind === "builtIn" ? variables[selection.name]?.type : undefined;
  const detailFillsAvailableHeight =
    selection?.kind === "custom" ||
    selectedType === "skills" ||
    selectedType === "json";

  return (
    <section className={cn("flex min-h-0 flex-col overflow-hidden", className)}>
      <div className="flex min-h-0 grow overflow-hidden">
        <aside className="flex w-64 shrink-0 flex-col border-r px-2 py-3">
          <ScrollArea className="min-h-0 grow">
            <div className="grid gap-3">
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
                  <AddVariableMenu
                    disabled={disabled}
                    onAddText={addCustom}
                    onAddJson={addJson}
                    onAddFile={addFile}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-foreground size-6"
                      disabled={disabled}
                      aria-label="Add custom variable"
                    >
                      <PlusIcon className="size-3.5" />
                    </Button>
                  </AddVariableMenu>
                }
              >
                {typedItems.length + customItems.length > 0 ? (
                  [...typedItems, ...customItems].map((item) => (
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
                      onRemove={() =>
                        item.kind === "custom"
                          ? confirmRemoveCustom(item.name)
                          : confirmRemoveTypedVariable(item.name)
                      }
                    />
                  ))
                ) : (
                  <div className="text-muted-foreground px-2 py-1 text-xs">
                    No custom variables.{" "}
                    <AddVariableMenu
                      disabled={disabled}
                      onAddText={addCustom}
                      onAddJson={addJson}
                      onAddFile={addFile}
                    >
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground focus-visible:text-foreground underline underline-offset-4 disabled:pointer-events-none disabled:opacity-50"
                        disabled={disabled}
                      >
                        Add variable
                      </button>
                    </AddVariableMenu>
                    .
                  </div>
                )}
              </VariableListGroup>
            </div>
          </ScrollArea>
          <AddVariableMenu
            disabled={disabled}
            onAddText={addCustom}
            onAddJson={addJson}
            onAddFile={addFile}
            side="top"
          >
            <Button
              className="text-muted-foreground mt-2 w-full"
              size="sm"
              variant="outline"
              disabled={disabled}
            >
              <PlusIcon className="size-3.5" />
              Add custom variable
            </Button>
          </AddVariableMenu>
        </aside>
        <ScrollArea
          className={cn(
            "min-h-0 min-w-0 grow",
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
          />
        </ScrollArea>
      </div>
      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRemove(null);
          }
        }}
        title="Delete variable?"
        description={
          pendingRemove
            ? pendingRemove.hasReferences
              ? `This thread references "{{${pendingRemove.name}}}". Deleting this variable will leave unresolved placeholders.`
              : `This removes "{{${pendingRemove.name}}}" and its value from this thread.`
            : undefined
        }
        confirmLabel="Delete variable"
        onConfirm={() => {
          pendingRemove?.onConfirm();
          setPendingRemove(null);
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
      <div className="text-muted-foreground flex min-h-6 items-center justify-between gap-2 px-2 text-[0.6875rem] font-medium tracking-wide uppercase">
        <span>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function AddVariableMenu({
  disabled,
  onAddText,
  onAddJson,
  onAddFile,
  side,
  children,
}: {
  disabled?: boolean;
  onAddText: () => void;
  onAddJson: () => void;
  onAddFile: () => void;
  side?: "top" | "bottom";
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side={side} sideOffset={4}>
        <DropdownMenuItem onSelect={onAddText}>
          <TypeIcon className="size-3.5" />
          Text
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onAddJson}>
          <BracesIcon className="size-3.5" />
          JSON
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onAddFile}>
          <FileTextIcon className="size-3.5" />
          File content
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function VariableListRow({
  item,
  selected,
  disabled,
  onSelect,
  onRemove,
}: {
  item: VariableListItem;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      className={cn(
        "group/variable-row relative rounded-md transition-colors",
        selected
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground",
        item.warning && !selected && "text-destructive"
      )}
    >
      <button
        type="button"
        className={cn(
          "focus-visible:ring-ring/30 flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-xs outline-none focus-visible:ring-2",
          onRemove && "pr-8"
        )}
        disabled={disabled}
        aria-pressed={selected}
        title={item.name}
        onClick={onSelect}
      >
        {_variableIcon(item)}
        <span className="min-w-0 grow truncate font-mono">{item.name}</span>
      </button>
      {onRemove ? (
        <Tooltip content="Delete variable">
          <button
            type="button"
            className="text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:ring-ring/30 absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded opacity-0 transition-opacity outline-none group-hover/variable-row:opacity-100 focus-visible:opacity-100 focus-visible:ring-2"
            aria-label={`Delete ${item.name}`}
            disabled={disabled}
            onClick={onRemove}
          >
            <Trash2Icon className="size-3.5" />
          </button>
        </Tooltip>
      ) : null}
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

  if (variable.type === "workingDirectory") {
    return (
      <WorkingDirectoryVariableDetail
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

  if (variable.type === "json") {
    return (
      <JsonVariableDetail
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

  if (variable.type === "file") {
    return (
      <FileVariableDetail
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

function WorkingDirectoryVariableDetail({
  name,
  variable,
  disabled,
  variables,
  customNames,
  onRename,
  onUpdate,
}: {
  name: string;
  variable: ThreadWorkingDirectoryVariable;
  disabled?: boolean;
  variables: Record<string, ThreadVariable>;
  customNames: Set<string>;
  onRename: (oldName: string, newName: string) => boolean;
  onUpdate: (name: string, variable: ThreadWorkingDirectoryVariable) => void;
}) {
  const { files } = useHostServices();
  const [directoryExists, setDirectoryExists] = useState<boolean | null>(null);
  const directoryCheckIdRef = useRef(0);

  const commitAndCheckPath = useCallback(
    async (rawValue: string) => {
      const checkId = ++directoryCheckIdRef.current;
      const value = _normalizeDirectoryPath(rawValue);
      if (value !== variable.value) {
        onUpdate(name, { ...variable, value });
      }
      if (!value) {
        setDirectoryExists(null);
        return;
      }

      setDirectoryExists(null);
      try {
        const exists = await files.directoryExists(value);
        if (directoryCheckIdRef.current === checkId) {
          setDirectoryExists(exists);
        }
      } catch {
        if (directoryCheckIdRef.current === checkId) {
          setDirectoryExists(null);
        }
      }
    },
    [files, name, onUpdate, variable]
  );

  const handlePathChange = useCallback(
    (value: string) => {
      ++directoryCheckIdRef.current;
      setDirectoryExists(null);
      onUpdate(name, { ...variable, value });
    },
    [name, onUpdate, variable]
  );

  const browse = useCallback(async () => {
    const path = await files.pickDirectory();
    if (path) {
      ++directoryCheckIdRef.current;
      setDirectoryExists(true);
      onUpdate(name, {
        ...variable,
        value: _normalizeDirectoryPath(path),
      });
    }
  }, [files, name, onUpdate, variable]);

  return (
    <DetailShell
      icon={<FolderOpenIcon className="text-muted-foreground size-4" />}
      title="Current working directory"
      disabled={disabled}
    >
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
      <Field label="Directory">
        <div className="flex items-center gap-2">
          <Input
            className="h-7 font-mono text-xs"
            value={variable.value}
            disabled={disabled}
            placeholder="~/Desktop/llm-space-project"
            onChange={(event) =>
              handlePathChange(event.currentTarget.value)
            }
            onBlur={(event) =>
              void commitAndCheckPath(event.currentTarget.value)
            }
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0"
            disabled={disabled}
            onClick={() => void browse()}
          >
            <FolderOpenIcon className="size-3.5" />
            Browse…
          </Button>
        </div>
      </Field>
      {directoryExists === false && (
        <p
          className="text-muted-foreground flex items-center gap-1.5 text-xs"
          role="status"
        >
          <TriangleAlertIcon
            className="size-3.5 shrink-0 text-amber-500 dark:text-amber-400"
            aria-hidden="true"
          />
          This folder hasn&apos;t been created yet, but it doesn&apos;t need to
          exist before you continue.
        </p>
      )}
    </DetailShell>
  );
}

function _normalizeDirectoryPath(value: string): string {
  const trimmed = value.trim();
  if (/^\/+$/.test(trimmed)) {
    return "/";
  }
  if (/^\\+$/.test(trimmed)) {
    return "\\";
  }
  if (/^[A-Za-z]:[\\/]$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed.replace(/[\\/]+$/, "");
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
  const usingAllSkills = includesAllSkills(variable);
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
        <Button
          className="text-muted-foreground hover:text-foreground focus-visible:text-foreground"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => setSkillsDialogOpen(true)}
        >
          <ListFilterIcon className="size-3.5" />
          Select skills
        </Button>
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
        <CodeEditor
          className={cn(
            "min-h-32 grow",
            (skillsLoading || Boolean(skillsError) || someMissing) &&
              "opacity-60"
          )}
          language="markdown"
          readonly
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
        includeAllSkills={usingAllSkills}
        onOpenChange={setSkillsDialogOpen}
        onApply={(skillNames, includeAll) => update({ skillNames, includeAll })}
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
}: {
  name: string;
  value: string;
  disabled?: boolean;
  variables: Record<string, ThreadVariable>;
  customNames: Set<string>;
  onRename: (oldName: string, newName: string) => boolean;
  onUpdate: (name: string, value: string) => void;
}) {
  return (
    <DetailShell
      icon={<TypeIcon className="text-muted-foreground size-4" />}
      title="User defined variable"
      disabled={disabled}
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
        <CodeEditor
          className="min-h-32 grow"
          language="markdown"
          value={value}
          readonly={disabled}
          placeholder="Variable value"
          onChange={(next) => onUpdate(name, next)}
        />
      </Field>
    </DetailShell>
  );
}

function JsonVariableDetail({
  name,
  variable,
  disabled,
  variables,
  customNames,
  onRename,
  onUpdate,
}: {
  name: string;
  variable: ThreadJsonVariable;
  disabled?: boolean;
  variables: Record<string, ThreadVariable>;
  customNames: Set<string>;
  onRename: (oldName: string, newName: string) => boolean;
  onUpdate: (name: string, variable: ThreadVariable) => void;
}) {
  const error = _jsonError(variable.value);
  return (
    <DetailShell
      icon={<BracesIcon className="text-muted-foreground size-4" />}
      title="JSON variable"
      disabled={disabled}
      className="flex h-full flex-col"
      contentClassName="flex min-h-0 grow flex-col"
    >
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
      <Field label="Value (JSON)" className="flex min-h-0 grow flex-col">
        <CodeEditor
          language="json"
          value={variable.value}
          readonly={disabled}
          placeholder={'{ "key": "value" }'}
          className="min-h-32 grow"
          onChange={(next) => onUpdate(name, { ...variable, value: next })}
        />
      </Field>
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : (
        <p className="text-muted-foreground text-xs">
          Use it in templates, e.g. {"{% if data.enabled %}"},{" "}
          {"{% for x in data.items %}"}, {"{{ data.name }}"}.
        </p>
      )}
    </DetailShell>
  );
}

function FileVariableDetail({
  name,
  variable,
  disabled,
  variables,
  customNames,
  onRename,
  onUpdate,
}: {
  name: string;
  variable: ThreadFileVariable;
  disabled?: boolean;
  variables: Record<string, ThreadVariable>;
  customNames: Set<string>;
  onRename: (oldName: string, newName: string) => boolean;
  onUpdate: (name: string, variable: ThreadVariable) => void;
}) {
  const { files } = useHostServices();
  const browse = useCallback(async () => {
    const path = await files.pickFile();
    if (path) {
      onUpdate(name, { ...variable, value: path });
    }
  }, [files, name, onUpdate, variable]);

  return (
    <DetailShell
      icon={<FileTextIcon className="text-muted-foreground size-4" />}
      title="File content variable"
      disabled={disabled}
    >
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
      <Field label="File path">
        <div className="flex items-center gap-2">
          <Input
            className="h-7 font-mono text-xs"
            value={variable.value}
            disabled={disabled}
            placeholder="~/notes/style.md"
            onChange={(event) =>
              onUpdate(name, { ...variable, value: event.currentTarget.value })
            }
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0"
            disabled={disabled}
            onClick={() => void browse()}
          >
            <FolderOpenIcon className="size-3.5" />
            Browse…
          </Button>
        </div>
      </Field>
      <p className="text-muted-foreground text-xs">
        Inlines the file contents at run time (a missing file → empty). For
        recursive rendering, use {'{{@include("...")}}'} instead.
      </p>
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
    return <TypeIcon className="size-3.5 shrink-0" />;
  }
  if (item.variable.type === "currentDate") {
    return <CalendarDaysIcon className="size-3.5 shrink-0" />;
  }
  if (item.variable.type === "workingDirectory") {
    return <FolderOpenIcon className="size-3.5 shrink-0" />;
  }
  if (item.variable.type === "json") {
    return <BracesIcon className="size-3.5 shrink-0" />;
  }
  if (item.variable.type === "file") {
    return <FileTextIcon className="size-3.5 shrink-0" />;
  }
  return <SparklesIcon className="size-3.5 shrink-0" />;
}

function _dateFormatLabel(value: ThreadCurrentDateVariable["format"]): string {
  return (
    PROMPT_DATE_FORMATS.find((format) => format.value === value)?.label ?? value
  );
}

/** A JSON parse error message for the editor, or `null` when valid/empty. */
function _jsonError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    JSON.parse(trimmed);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid JSON.";
  }
}

/** The list-row status line for a JSON variable. */
function _jsonStatus(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "(empty)";
  }
  return _jsonError(trimmed) ? "Invalid JSON" : trimmed.replace(/\s+/g, " ");
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

export const PromptVariablesPanel = memo(_PromptVariablesPanel);
