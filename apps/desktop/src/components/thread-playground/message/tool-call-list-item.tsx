import {
  isExecutableTool,
  type ThreadContext,
  type ToolCall,
  type ToolCallInput,
} from "@llm-space/core";
import { createToolResultPromptVariablePlaceKey } from "@llm-space/core/thread";
import {
  AlertCircleIcon,
  CheckIcon,
  CopyIcon,
  EyeIcon,
  Loader2,
  PlayIcon,
} from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { openFirecrawlLimitDialog } from "@/components/firecrawl-limit-dialog";
import { PreviewDialog } from "@/components/preview-dialog-lazy";
import { useRenderingFidelity } from "@/components/theme-provider";
import { Tooltip } from "@/components/tooltip";
import { Marker, MarkerContent } from "@/components/ui/marker";
import { cn } from "@/lib/utils";

import { CodeEditor, type CodeEditorProps } from "../../code-editor";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { useThreadStoreActions } from "../stores";
import { usePromptVariableExtensionForContext } from "../variable/use-prompt-variable-extension";

import { ToolCallInputView } from "./tool-call-input-view";
import { getToolCallOutputText } from "./tool-call-status";
import { useToolCallRunner } from "./use-tool-call-runner";
import {
  parseWebSearchOutput,
  WebSearchResultsView,
} from "./web-search-results-view";

function _ToolCallListItem({
  context,
  messageId,
  toolCall,
  canContinue,
  onContinue,
  readonly = false,
}: {
  context?: ThreadContext;
  messageId: string;
  toolCall: ToolCall;
  canContinue: boolean;
  onContinue: () => void;
  readonly?: boolean;
}) {
  const { fidelity } = useRenderingFidelity();
  const { updateToolCallOutputText } = useThreadStoreActions();
  const { resolveTool, runToolCall } = useToolCallRunner(messageId);
  const variableExtension = usePromptVariableExtensionForContext(
    createToolResultPromptVariablePlaceKey(messageId, toolCall.id),
    context
  );
  const tool = resolveTool(toolCall.input.name);
  const executable = tool !== undefined && isExecutableTool(tool);
  const [calling, setCalling] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const outputText = useMemo(() => getToolCallOutputText(toolCall), [toolCall]);
  const isError = toolCall.output?.isError ?? false;
  const handleOutputChange = useCallback(
    (value: string) => {
      if (readonly) {
        return;
      }
      updateToolCallOutputText(messageId, toolCall.id, value);
    },
    [messageId, readonly, toolCall.id, updateToolCallOutputText]
  );
  const toggleError = useCallback(() => {
    if (readonly) {
      return;
    }
    updateToolCallOutputText(messageId, toolCall.id, outputText, !isError);
  }, [
    isError,
    messageId,
    outputText,
    readonly,
    toolCall.id,
    updateToolCallOutputText,
  ]);
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        if (canContinue) {
          onContinue();
        } else {
          toast.error("Add tool responses before continuing");
        }
      }
    },
    [canContinue, onContinue]
  );
  const handleCall = useCallback(async () => {
    if (readonly || !executable) {
      return;
    }
    setCalling(true);
    try {
      const outcome = await runToolCall(toolCall);
      if (outcome?.isError) {
        if (outcome.isFirecrawlLimit) {
          openFirecrawlLimitDialog();
        } else {
          toast.error(`Failed to call ${toolCall.input.name}()`);
        }
      }
    } finally {
      setCalling(false);
    }
  }, [executable, readonly, runToolCall, toolCall]);
  const handleCopyArguments = useCallback(async () => {
    const text = formatJson(toolCall.input.arguments);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Arguments copied");
    } catch {
      toast.error("Failed to copy arguments");
    }
  }, [toolCall.input.arguments]);
  return (
    <div className="bg-foreground/4 flex w-full flex-col gap-2 rounded-md px-3 pt-2 pb-3">
      <div className="relative flex min-w-0 items-start">
        <ToolCallInputView input={toolCall.input} />
        <div className="absolute top-0 right-0 flex items-center">
          <Tooltip content="Copy arguments">
            <Button
              className="invisible shrink-0 group-hover/message:visible"
              size="icon"
              variant="secondary"
              onClick={() => void handleCopyArguments()}
            >
              <CopyIcon className="size-3" />
            </Button>
          </Tooltip>
          {executable ? (
            <Tooltip content="Call this tool">
              <Button
                className="invisible shrink-0 group-hover/message:visible"
                size="icon"
                variant="secondary"
                disabled={readonly || calling}
                onClick={() => void handleCall()}
              >
                {calling ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <PlayIcon className="size-3" />
                )}
              </Button>
            </Tooltip>
          ) : null}
        </div>
      </div>
      <hr />
      <div className="flex w-full flex-col gap-1">
        <div className="text-muted-foreground flex min-w-0 items-center justify-between gap-2 text-xs">
          <Marker role="status" className="gap-1">
            <MarkerContent className="flex items-center text-xs">
              Response
              <Tooltip content="Preview response">
                <Button
                  className="invisible shrink-0 group-hover/message:visible"
                  size="xs"
                  variant="ghost"
                  disabled={outputText === ""}
                  onClick={() => setPreviewOpen(true)}
                >
                  <EyeIcon className="size-3" />
                </Button>
              </Tooltip>
            </MarkerContent>
          </Marker>
          <div className="flex items-center">
            <Button
              className="invisible shrink-0 group-hover/message:visible"
              size="xs"
              variant={isError ? "destructive" : "ghost"}
              disabled={readonly}
              onClick={toggleError}
            >
              <AlertCircleIcon />
              {isError ? "Clear error" : "Mark as error"}
            </Button>
          </div>
        </div>
        <PreviewDialog
          open={previewOpen}
          title={`Response of ${toolCall.input.name}()`}
          value={outputText}
          onOpenChange={setPreviewOpen}
        />
        <ToolCallResponseEditor
          input={toolCall.input}
          plain={fidelity === "lite"}
          readonly={readonly}
          value={outputText}
          extraExtensions={variableExtension}
          onChange={handleOutputChange}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
}
export const ToolCallListItem = memo(_ToolCallListItem);

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? String(value);
}

// -- tool-call response editors -----------------------------------------------

/**
 * Picks the response editor for a tool call. Specialized editors (e.g.
 * {@link AskUserQuestionEditor}) render only when the tool call's input matches
 * their expected shape; anything else falls back to the plain code editor.
 */
function _ToolCallResponseEditor({
  input,
  plain,
  value,
  readonly,
  extraExtensions,
  onChange,
  onKeyDown,
}: {
  input: ToolCallInput;
  plain: boolean;
  value: string;
  readonly: boolean;
  extraExtensions: CodeEditorProps["extraExtensions"];
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}) {
  const askUserQuestion = useMemo(
    () => parseAskUserQuestionInput(input),
    [input]
  );
  const webSearchResults = useMemo(
    () => parseWebSearchOutput(input, value),
    [input, value]
  );

  if (webSearchResults) {
    return <WebSearchResultsView results={webSearchResults} />;
  }

  if (askUserQuestion) {
    return (
      <AskUserQuestionEditor
        questions={askUserQuestion}
        value={value}
        readonly={readonly}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />
    );
  }

  return (
    <CodeEditor
      className="max-h-96 min-h-9.5 px-0!"
      hideBorder
      hideFocusRing
      scrollOnFocus
      plain={plain}
      placeholder={`Enter the response of ${input.name}()`}
      readonly={readonly}
      value={value}
      extraExtensions={extraExtensions}
      onChange={onChange}
      onKeyDown={onKeyDown}
    />
  );
}
const ToolCallResponseEditor = memo(_ToolCallResponseEditor);

// -- ask_user_question --------------------------------------------------------

interface AskUserQuestionOption {
  label: string;
  description?: string;
}

interface AskUserQuestionItem {
  question: string;
  header?: string;
  options: AskUserQuestionOption[];
  multiSelect: boolean;
}

/** One question's selection: chosen option labels plus a free-form "Other". */
interface QuestionSelection {
  selected: string[];
  otherEnabled: boolean;
  otherText: string;
}

/**
 * Validate a tool call's input against the `ask_user_question` outline and, on
 * success, return the normalized questions. Returns `null` for any other tool
 * or a malformed payload, so the caller falls back to the default editor.
 */
function parseAskUserQuestionInput(
  input: ToolCallInput
): AskUserQuestionItem[] | null {
  if (input.name !== "ask_user_question") {
    return null;
  }
  const rawQuestions = (input.arguments as Record<string, unknown>)?.questions;
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    return null;
  }

  const questions: AskUserQuestionItem[] = [];
  for (const rawQuestion of rawQuestions) {
    if (typeof rawQuestion !== "object" || rawQuestion === null) {
      return null;
    }
    const q = rawQuestion as Record<string, unknown>;
    if (typeof q.question !== "string" || q.question === "") {
      return null;
    }
    if (!Array.isArray(q.options) || q.options.length === 0) {
      return null;
    }
    const options: AskUserQuestionOption[] = [];
    for (const rawOption of q.options) {
      if (typeof rawOption !== "object" || rawOption === null) {
        return null;
      }
      const o = rawOption as Record<string, unknown>;
      if (typeof o.label !== "string" || o.label === "") {
        return null;
      }
      options.push({
        label: o.label,
        description:
          typeof o.description === "string" ? o.description : undefined,
      });
    }
    questions.push({
      question: q.question,
      header: typeof q.header === "string" ? q.header : undefined,
      options,
      multiSelect: q.multi_select === true,
    });
  }
  return questions;
}

/** Seed each question's selection from the existing response JSON, if any. */
function _initSelections(
  questions: AskUserQuestionItem[],
  value: string
): QuestionSelection[] {
  let parsed: unknown;
  try {
    parsed = value ? JSON.parse(value) : null;
  } catch {
    parsed = null;
  }
  const rawAnswers =
    parsed !== null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    typeof (parsed as Record<string, unknown>).answers === "object" &&
    (parsed as Record<string, unknown>).answers !== null
      ? ((parsed as Record<string, unknown>).answers as Record<string, unknown>)
      : {};

  return questions.map((question) => {
    const raw = rawAnswers[question.question];
    const answers = Array.isArray(raw)
      ? raw.filter((a): a is string => typeof a === "string")
      : typeof raw === "string"
        ? [raw]
        : [];
    const labels = new Set(question.options.map((o) => o.label));
    const selected = answers.filter((a) => labels.has(a));
    const other = answers.filter((a) => !labels.has(a));
    return {
      selected: question.multiSelect ? selected : selected.slice(0, 1),
      otherEnabled: other.length > 0,
      otherText: other[0] ?? "",
    };
  });
}

/** Build one question's answer list: chosen labels plus the "Other" text. */
function _answerFor(selection: QuestionSelection): string[] {
  const answer = [...selection.selected];
  if (selection.otherEnabled) {
    answer.push(selection.otherText.trim() || "Other");
  }
  return answer;
}

/** Serialize selections to the response JSON string. */
function _serialize(
  questions: AskUserQuestionItem[],
  selections: QuestionSelection[]
): string {
  const answers: Record<string, string[]> = {};
  questions.forEach((question, index) => {
    answers[question.question] = _answerFor(selections[index]);
  });
  return JSON.stringify({ answers }, null, 2);
}

/**
 * A form-based response editor for `ask_user_question`: renders each question
 * with single- or multi-select options plus a free-form "Other". The response
 * is written back as `{ answers: { [question]: string[] } }` — one entry per
 * question, keyed by the question text, its value a list of the chosen option
 * labels (or the typed "Other").
 */
function AskUserQuestionEditor({
  questions,
  value,
  readonly,
  onChange,
  onKeyDown,
}: {
  questions: AskUserQuestionItem[];
  value: string;
  readonly: boolean;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}) {
  const [selections, setSelections] = useState<QuestionSelection[]>(() =>
    _initSelections(questions, value)
  );

  const commit = useCallback(
    (index: number, next: QuestionSelection) => {
      if (readonly) {
        return;
      }
      const updated = selections.map((s, i) => (i === index ? next : s));
      setSelections(updated);
      onChange(_serialize(questions, updated));
    },
    [onChange, questions, readonly, selections]
  );

  const toggleOption = useCallback(
    (index: number, label: string) => {
      const question = questions[index];
      const current = selections[index];
      if (question.multiSelect) {
        const has = current.selected.includes(label);
        commit(index, {
          ...current,
          selected: has
            ? current.selected.filter((l) => l !== label)
            : [...current.selected, label],
        });
        return;
      }
      // Single-select: exclusive with itself and with "Other".
      const isOnlySelected =
        current.selected.length === 1 &&
        current.selected[0] === label &&
        !current.otherEnabled;
      commit(index, {
        selected: isOnlySelected ? [] : [label],
        otherEnabled: false,
        otherText: current.otherText,
      });
    },
    [commit, questions, selections]
  );

  const toggleOther = useCallback(
    (index: number) => {
      const question = questions[index];
      const current = selections[index];
      if (question.multiSelect) {
        commit(index, { ...current, otherEnabled: !current.otherEnabled });
        return;
      }
      commit(index, {
        selected: [],
        otherEnabled: !current.otherEnabled,
        otherText: current.otherText,
      });
    },
    [commit, questions, selections]
  );

  const setOtherText = useCallback(
    (index: number, text: string) => {
      const question = questions[index];
      const current = selections[index];
      commit(index, {
        selected: question.multiSelect ? current.selected : [],
        otherEnabled: true,
        otherText: text,
      });
    },
    [commit, questions, selections]
  );

  return (
    <div className="flex w-full flex-col gap-4" onKeyDown={onKeyDown}>
      {questions.map((question, index) => {
        const selection = selections[index];
        return (
          <div key={index} className="flex flex-col gap-2">
            {question.header && (
              <div className="text-muted-foreground text-[0.625rem] font-medium tracking-wide uppercase">
                {question.header}
              </div>
            )}
            <div className="text-sm font-medium">{question.question}</div>
            <div className="flex flex-col gap-1">
              {question.options.map((option) => (
                <OptionRow
                  key={option.label}
                  label={option.label}
                  description={option.description}
                  multiSelect={question.multiSelect}
                  selected={selection.selected.includes(option.label)}
                  disabled={readonly}
                  onClick={() => toggleOption(index, option.label)}
                />
              ))}
              <OptionRow
                label="Other"
                multiSelect={question.multiSelect}
                selected={selection.otherEnabled}
                disabled={readonly}
                onClick={() => toggleOther(index)}
              />
              {selection.otherEnabled && (
                <Input
                  className="ml-6 h-8 w-[calc(100%-1.5rem)]"
                  placeholder="Type your answer…"
                  aria-label={`Other answer for "${question.question}"`}
                  disabled={readonly}
                  value={selection.otherText}
                  onChange={(e) => setOtherText(index, e.target.value)}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** One selectable option row: a radio (single) or checkbox (multi) affordance. */
function OptionRow({
  label,
  description,
  multiSelect,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  description?: string;
  multiSelect: boolean;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        "hover:bg-foreground/6 disabled:cursor-default disabled:hover:bg-transparent"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center border transition-colors",
          multiSelect ? "rounded-[4px]" : "rounded-full",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-input"
        )}
      >
        {selected && <CheckIcon className="size-3" />}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{label}</span>
        {description && (
          <span className="text-muted-foreground text-xs">{description}</span>
        )}
      </span>
    </button>
  );
}
