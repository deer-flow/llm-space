"use client";

import type { Thread } from "@llm-space/core";
import { isMetaUserMessage } from "@llm-space/core/generator";
import {
  applyCompactionPreview,
  COMPACTION_SYSTEM_PROMPT,
  createRenderedCompactionUserPrompt,
  planCompaction,
  type CompactionPlan,
} from "@llm-space/core/thread";
import {
  ArrowRightIcon,
  CheckIcon,
  CircleHelpIcon,
  FileArchiveIcon,
  FileStackIcon,
  Layers3Icon,
  MessageSquareTextIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { Markdown } from "@llm-space/ui/components/markdown";
import { Tooltip } from "@llm-space/ui/components/tooltip";
import { useHostServices } from "@llm-space/ui/host";
import { docsUrl } from "@llm-space/ui/lib/docs-url";
import { cn } from "@llm-space/ui/lib/utils";
import { Button } from "@llm-space/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@llm-space/ui/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@llm-space/ui/ui/select";
import { Spinner } from "@llm-space/ui/ui/spinner";
import { Textarea } from "@llm-space/ui/ui/textarea";

import { useFirstAvailableModel } from "../model-provider";

import { createRuntimePromptFiles } from "./runtime-prompt-files";
import {
  useThreadStore,
  useThreadStoreActions,
  useThreadStoreApi,
} from "./stores";
import { useStreamText } from "./use-stream-text";
import { listEnabledPromptVariableSkills } from "./variable/prompt-variable-skills";

const DEFAULT_KEEP_TURNS = 3;
type WizardStep = "introduction" | "configure" | "compact";

const WIZARD_STEPS: { id: WizardStep; title: string }[] = [
  { id: "introduction", title: "Introduction" },
  { id: "configure", title: "Configure" },
  { id: "compact", title: "Compact" },
];

export function ThreadCompactionDialog({
  disabled = false,
  open: controlledOpen,
  onOpenChange,
  onApplyCompaction,
  showTrigger = true,
}: {
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onApplyCompaction?: (thread: Thread) => Promise<void>;
  showTrigger?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setDialogOpen = useCallback(
    (next: boolean) => {
      if (onOpenChange) onOpenChange(next);
      else setInternalOpen(next);
    },
    [onOpenChange]
  );
  const [step, setStep] = useState<WizardStep>("introduction");
  const [preparing, setPreparing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preparationError, setPreparationError] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");
  const instructionsRef = useRef("");
  const preparationVersionRef = useRef(0);
  const messages = useThreadStore((state) => state.thread.context?.messages ?? []);
  const threadModel = useThreadStore((state) => state.thread.model);
  const runtimeId = useThreadStore((state) => state.runtimeId);
  const fallbackModel = useFirstAvailableModel();
  const { actions, files, skills } = useHostServices();
  const store = useThreadStoreApi();
  const { restoreThread } = useThreadStoreActions();
  const hasMetaUserPrompt = useThreadStore((state) =>
    isMetaUserMessage(state.thread.context)
  );
  const realTurnCount = useMemo(
    () =>
      planCompaction(messages, 0, { hasMetaUserPrompt }).turnCount,
    [hasMetaUserPrompt, messages]
  );
  const maxKeepTurns = Math.max(0, realTurnCount - 1);
  const defaultKeepTurns = Math.min(DEFAULT_KEEP_TURNS, maxKeepTurns);
  const [keepTurns, setKeepTurns] = useState(defaultKeepTurns);
  const plan = useMemo(
    () => planCompaction(messages, keepTurns, { hasMetaUserPrompt }),
    [hasMetaUserPrompt, keepTurns, messages]
  );
  const { text, error, streaming, run, abort } = useStreamText({
    systemPrompt: COMPACTION_SYSTEM_PROMPT,
    userPrompt: "",
    reasoning: "off",
    model: threadModel ?? fallbackModel ?? undefined,
  });
  const canCompact = maxKeepTurns >= 1;
  const busy = preparing || streaming || applying;
  const visibleError = preparationError ?? (preparing ? null : error);

  const keepOptions = useMemo(() => {
    return Array.from({ length: maxKeepTurns }, (_, index) => index + 1);
  }, [maxKeepTurns]);

  const persistInstructions = useCallback(
    (value = instructionsRef.current) => {
      const current = store.getState().thread;
      const normalized = value.trim();
      const existing = current.meta?.compactionInstructions;
      if (existing === (normalized || undefined)) return;

      const nextMeta = { ...current.meta };
      if (normalized) {
        nextMeta.compactionInstructions = normalized;
      } else {
        delete nextMeta.compactionInstructions;
      }
      restoreThread({
        ...current,
        meta: Object.keys(nextMeta).length > 0 ? nextMeta : undefined,
      });
    },
    [restoreThread, store]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        abort();
        persistInstructions();
      }
      preparationVersionRef.current += 1;
      setPreparing(false);
      setApplying(false);
      setPreparationError(null);
      if (next) {
        setStep("introduction");
        setKeepTurns(defaultKeepTurns);
        const savedInstructions =
          store.getState().thread.meta?.compactionInstructions ?? "";
        instructionsRef.current = savedInstructions;
        setInstructions(savedInstructions);
      }
      setDialogOpen(next);
    },
    [abort, defaultKeepTurns, persistInstructions, setDialogOpen, store]
  );

  const changeKeepTurns = useCallback(
    (value: string) => {
      abort();
      preparationVersionRef.current += 1;
      setPreparing(false);
      setPreparationError(null);
      setKeepTurns(Number(value));
    },
    [abort]
  );

  const changeInstructions = useCallback(
    (value: string) => {
      instructionsRef.current = value;
      abort();
      preparationVersionRef.current += 1;
      setPreparing(false);
      setPreparationError(null);
      setInstructions(value);
    },
    [abort]
  );

  const startCompaction = useCallback(async () => {
    const current = store.getState().thread;
    const customInstructions = instructionsRef.current;
    persistInstructions(customInstructions);
    setStep("compact");
    if (!runtimeId) {
      setPreparationError("Thread runtime is not available.");
      return;
    }

    const version = preparationVersionRef.current + 1;
    preparationVersionRef.current = version;
    setPreparing(true);
    setPreparationError(null);

    try {
      const promptFiles = createRuntimePromptFiles(files, runtimeId);
      const userPrompt = await createRenderedCompactionUserPrompt({
        context: current.context ?? {},
        keepRecentTurns: keepTurns,
        hasMetaUserPrompt,
        customInstructions,
        loadSkills: () =>
          listEnabledPromptVariableSkills(skills, { runtimeId }),
        loadFile: promptFiles.loadFile,
        fileExists: promptFiles.fileExists,
        resolvePath: (path) => files.resolvePath(path),
      });
      if (preparationVersionRef.current !== version) return;

      setPreparing(false);
      await run({ userPrompt });
    } catch (cause) {
      if (preparationVersionRef.current !== version) return;
      setPreparing(false);
      setPreparationError(
        cause instanceof Error ? cause.message : String(cause)
      );
    }
  }, [
    files,
    hasMetaUserPrompt,
    keepTurns,
    persistInstructions,
    run,
    runtimeId,
    skills,
    store,
  ]);

  const applyPreview = useCallback(async () => {
    const summary = text.trim();
    if (!summary || busy) return;
    const current = store.getState().thread;
    const freshPlan = planCompaction(
      current.context?.messages ?? [],
      keepTurns,
      { hasMetaUserPrompt: isMetaUserMessage(current.context) }
    );
    const compactedThread = _buildCompactedThread(current, freshPlan, summary);
    setApplying(true);
    setPreparationError(null);
    try {
      if (onApplyCompaction) {
        await onApplyCompaction(compactedThread);
      } else {
        restoreThread(compactedThread);
      }
      setDialogOpen(false);
      toast.success(
        onApplyCompaction ? "Compacted thread created" : "Conversation compacted",
        {
          description: `${freshPlan.keptTurnCount} recent ${freshPlan.keptTurnCount === 1 ? "turn remains" : "turns remain"} verbatim.`,
        }
      );
    } catch (cause) {
      setPreparationError(
        cause instanceof Error ? cause.message : String(cause)
      );
    } finally {
      setApplying(false);
    }
  }, [
    busy,
    keepTurns,
    onApplyCompaction,
    restoreThread,
    setDialogOpen,
    store,
    text,
  ]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {showTrigger ? (
        <Tooltip
          content={
            canCompact
              ? "Compact conversation"
              : "At least two user turns are needed to compact"
          }
        >
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Compact conversation"
              disabled={disabled || !canCompact}
            >
              <FileArchiveIcon className="size-4" />
            </Button>
          </DialogTrigger>
        </Tooltip>
      ) : null}

      <DialogContent className="flex h-[48rem] max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="relative overflow-hidden border-b px-6 py-4 text-left sm:text-left">
          <div
            aria-hidden="true"
            className="from-primary/10 via-primary/[0.03] pointer-events-none absolute inset-0 bg-gradient-to-r to-transparent"
          />
          <div className="relative grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
            <div className="border-primary/20 bg-primary/10 text-primary row-span-2 flex size-9 items-center justify-center rounded-xl border">
              <FileArchiveIcon className="size-4" />
            </div>
            <DialogTitle className="col-start-2 flex items-center gap-2 text-base">
              Compact conversation
              <span className="bg-primary/15 text-primary rounded px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wide uppercase">
                Preview
              </span>
            </DialogTitle>
            <DialogDescription className="col-start-2">
              {step === "introduction"
                ? "See how compaction creates room without losing the thread."
                : step === "configure"
                  ? "Choose what stays verbatim and what the checkpoint should emphasize."
                  : "Review the generated checkpoint before changing the conversation."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="relative border-b px-8 py-3">
          <div
            aria-hidden="true"
            className="from-muted/[0.08] pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b to-transparent"
          />
          <WizardStepIndicator step={step} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-5">
          {step === "introduction" ? <IntroductionStep /> : null}
          {step === "configure" ? (
            <ConfigureStep
              keepTurns={keepTurns}
              keepOptions={keepOptions}
              instructions={instructions}
              summarizedTurns={plan.turnCount - plan.keptTurnCount}
              keptTurns={plan.keptTurnCount}
              hasPreviousCheckpoint={Boolean(plan.previousSummary)}
              disabled={busy}
              onKeepTurnsChange={changeKeepTurns}
              onInstructionsChange={changeInstructions}
            />
          ) : null}
          {step === "compact" ? (
            <ExecutionStep
              text={text}
              busy={busy}
              applying={applying}
              preparing={preparing}
              error={visibleError}
              keptTurns={plan.keptTurnCount}
              onRegenerate={() => void startCompaction()}
            />
          ) : null}
        </div>

        <DialogFooter className="bg-background/80 border-t px-6 py-4 backdrop-blur-xl sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => actions.openLink(docsUrl("compaction"))}
          >
            <CircleHelpIcon className="size-4" />
            Help
          </Button>
          <div className="flex items-center justify-end gap-2">
            {step === "introduction" ? (
              <>
                <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setStep("configure")}>Next</Button>
              </>
            ) : null}
            {step === "configure" ? (
              <>
                <Button variant="ghost" onClick={() => setStep("introduction")}>
                  Back
                </Button>
                <Button onClick={() => void startCompaction()}>
                  Start compact
                </Button>
              </>
            ) : null}
            {step === "compact" ? (
              <>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setStep("configure")}
                >
                  Back
                </Button>
                {text.trim() &&
                !visibleError &&
                !preparing &&
                !streaming ? (
                  <Button
                    disabled={applying}
                    onClick={() => void applyPreview()}
                  >
                    {applying ? <Spinner className="size-3" /> : null}
                    {applying ? "Creating copy…" : "Apply compaction"}
                  </Button>
                ) : (
                  <Button
                    disabled={busy}
                    onClick={() => void startCompaction()}
                  >
                    {busy ? <Spinner className="size-3" /> : null}
                    {busy
                      ? preparing
                        ? "Preparing…"
                        : "Compacting…"
                      : "Try again"}
                  </Button>
                )}
              </>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function _buildCompactedThread(
  current: Thread,
  plan: CompactionPlan,
  summary: string
): Thread {
  return {
    ...current,
    context: {
      ...current.context,
      messages: applyCompactionPreview(plan, summary),
      snapshot: undefined,
    },
  };
}

function WizardStepIndicator({ step }: { step: WizardStep }) {
  const activeIndex = WIZARD_STEPS.findIndex((item) => item.id === step);
  return (
    <div className="relative mx-auto flex max-w-2xl items-center">
      {WIZARD_STEPS.map((item, index) => {
        const completed = index < activeIndex;
        const active = index === activeIndex;
        return (
          <div
            key={item.id}
            className={cn("flex items-center", index > 0 && "flex-1")}
          >
            {index > 0 ? (
              <div
                className={cn(
                  "mx-3 h-px flex-1 transition-colors",
                  index <= activeIndex ? "bg-primary" : "bg-border/60"
                )}
              />
            ) : null}
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border text-[0.6875rem] font-semibold transition-all",
                  completed &&
                    "border-primary bg-primary text-primary-foreground",
                  active &&
                    "border-primary bg-primary/10 text-primary ring-primary/10 ring-4",
                  !completed && !active &&
                    "border-border/60 text-muted-foreground"
                )}
              >
                {completed ? <CheckIcon className="size-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  active || completed
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {item.title}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IntroductionStep() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="text-center">
        <div className="text-primary mb-2 text-[0.6875rem] font-semibold tracking-widest uppercase">
          Context housekeeping
        </div>
        <h2 className="text-xl font-semibold tracking-tight">
          Make room without losing the plot
        </h2>
        <p className="text-muted-foreground mx-auto mt-2 max-w-xl text-xs/relaxed">
          Compaction replaces older turns with one structured checkpoint while
          leaving your most recent work untouched.
        </p>
      </div>

      <div className="border-border/70 bg-muted/10 relative overflow-hidden rounded-2xl border p-5">
        <div
          aria-hidden="true"
          className="from-primary/10 pointer-events-none absolute -top-20 left-1/3 size-56 rounded-full bg-radial to-transparent blur-2xl"
        />
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-5">
          <DiagramCard
            icon={<MessageSquareTextIcon className="size-4" />}
            eyebrow="Long context"
            title="Every turn"
          >
            <div className="mt-4 space-y-2">
              <MiniTurn tone="muted" width="w-full" />
              <MiniTurn tone="muted" width="w-4/5" />
              <MiniTurn tone="primary" width="w-full" />
            </div>
          </DiagramCard>

          <div className="text-primary flex flex-col items-center gap-1.5">
            <div className="border-primary/20 bg-primary/10 flex size-10 items-center justify-center rounded-full border">
              <FileArchiveIcon className="size-4" />
            </div>
            <ArrowRightIcon className="size-4" />
          </div>

          <DiagramCard
            icon={<FileArchiveIcon className="size-4" />}
            eyebrow="Smaller context"
            title="Checkpoint + recent work"
          >
            <div className="mt-4 space-y-2">
              <div className="border-primary/20 bg-primary/8 rounded-md border p-2">
                <div className="bg-primary/45 h-1.5 w-2/3 rounded-full" />
                <div className="bg-primary/20 mt-1.5 h-1.5 w-full rounded-full" />
              </div>
              <MiniTurn tone="primary" width="w-full" />
            </div>
          </DiagramCard>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x rounded-xl border bg-background/40">
        <IntroPrinciple
          icon={<ShieldCheckIcon className="size-4" />}
          title="Preview first"
          copy="Nothing changes until you apply."
        />
        <IntroPrinciple
          icon={<MessageSquareTextIcon className="size-4" />}
          title="Recent turns stay exact"
          copy="Keep the active part of the conversation verbatim."
        />
        <IntroPrinciple
          icon={<Layers3Icon className="size-4" />}
          title="Progressive"
          copy="Each checkpoint evolves instead of starting over."
        />
      </div>
    </div>
  );
}

function ConfigureStep({
  keepTurns,
  keepOptions,
  instructions,
  summarizedTurns,
  keptTurns,
  hasPreviousCheckpoint,
  disabled,
  onKeepTurnsChange,
  onInstructionsChange,
}: {
  keepTurns: number;
  keepOptions: number[];
  instructions: string;
  summarizedTurns: number;
  keptTurns: number;
  hasPreviousCheckpoint: boolean;
  disabled: boolean;
  onKeepTurnsChange: (value: string) => void;
  onInstructionsChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-[17rem_minmax(0,1fr)]">
      <div className="space-y-5">
        <div>
          <div className="text-muted-foreground mb-3 text-[0.6875rem] font-semibold tracking-wider uppercase">
            Retention
          </div>
          <label className="text-foreground mb-2 block text-xs font-medium">
            Keep recent turns
          </label>
          <Select
            value={String(keepTurns)}
            disabled={disabled}
            onValueChange={onKeepTurnsChange}
          >
            <SelectTrigger
              className="w-full bg-background/60"
              aria-label="Keep recent turns"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {keepOptions.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value} {value === 1 ? "turn" : "turns"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground mt-2 text-[0.6875rem]/relaxed">
            A turn starts with a user message and includes the assistant reply
            and its tool calls.
          </p>
        </div>

        <div>
          <label
            htmlFor="compaction-instructions"
            className="text-foreground mb-2 block text-xs font-medium"
          >
            Compaction instructions
            <span className="text-muted-foreground ml-1 font-normal">
              Optional
            </span>
          </label>
          <Textarea
            id="compaction-instructions"
            value={instructions}
            onChange={(event) => onInstructionsChange(event.target.value)}
            placeholder="Focus on decisions, unresolved work, and exact implementation details."
            className="bg-background/60 min-h-28 resize-y"
          />
          <p className="text-muted-foreground mt-2 text-[0.6875rem]/relaxed">
            Appended as additional focus for the summarizer and saved with this
            thread.
          </p>
        </div>
      </div>

      <CompactionMap
        summarizedTurns={summarizedTurns}
        keptTurns={keptTurns}
        hasPreviousCheckpoint={hasPreviousCheckpoint}
      />
    </div>
  );
}

function CompactionMap({
  summarizedTurns,
  keptTurns,
  hasPreviousCheckpoint,
}: {
  summarizedTurns: number;
  keptTurns: number;
  hasPreviousCheckpoint: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-3">
        <HistoryPanel
          title="Before"
          badge={_formatTurns(summarizedTurns + keptTurns)}
        >
          {hasPreviousCheckpoint ? (
            <MessageBlock label="Existing checkpoint" />
          ) : null}
          <div className="border-border/60 bg-muted/15 rounded-lg border border-dashed p-3">
            <div className="text-muted-foreground mb-2 flex items-center justify-between text-[0.625rem] font-medium uppercase">
              <span>Older work</span>
              <span>{_formatTurns(summarizedTurns)}</span>
            </div>
            <TurnStack count={summarizedTurns} tone="muted" />
          </div>
          <div className="border-primary/25 bg-primary/[0.04] rounded-lg border p-3">
            <div className="text-primary mb-2 flex items-center justify-between text-[0.625rem] font-medium uppercase">
              <span>Keep zone</span>
              <span>{_formatTurns(keptTurns)}</span>
            </div>
            <TurnStack count={keptTurns} tone="primary" />
          </div>
        </HistoryPanel>

        <div className="text-primary flex flex-col items-center justify-center gap-2 px-1">
          <span className="border-primary/20 bg-primary/10 flex size-9 items-center justify-center rounded-full border">
            <ArrowRightIcon className="size-4" />
          </span>
          <span className="text-[0.5625rem] font-semibold tracking-wider uppercase [writing-mode:vertical-rl]">
            Compact
          </span>
        </div>

        <HistoryPanel
          title="After"
          badge={`checkpoint + ${keptTurns}`}
          accent
        >
          <div className="border-primary/25 bg-primary/[0.07] rounded-lg border p-3 shadow-sm shadow-primary/5">
            <div className="text-primary mb-2 flex items-center gap-1.5 font-mono text-[0.5625rem]">
              <FileArchiveIcon className="size-3" />
              &lt;system-reminder&gt;
            </div>
            <div className="space-y-1.5">
              <div className="bg-primary/45 h-1.5 w-3/5 rounded-full" />
              <div className="bg-primary/20 h-1.5 w-full rounded-full" />
              <div className="bg-primary/20 h-1.5 w-4/5 rounded-full" />
            </div>
            <div className="text-primary/70 mt-2 text-right font-mono text-[0.5625rem]">
              &lt;/system-reminder&gt;
            </div>
          </div>
          <div className="border-primary/25 bg-primary/[0.04] rounded-lg border p-3">
            <div className="text-primary mb-2 flex items-center justify-between text-[0.625rem] font-medium uppercase">
              <span>Unchanged</span>
              <span>{_formatTurns(keptTurns)}</span>
            </div>
            <TurnStack count={keptTurns} tone="primary" />
          </div>
        </HistoryPanel>
      </div>

      <div className="border-border/70 bg-muted/10 rounded-xl border p-4">
        <div className="flex items-start gap-3">
          <div className="border-primary/20 bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg border">
            <Layers3Icon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium">Progressive by design</div>
            <p className="text-muted-foreground mt-1 text-[0.6875rem]/relaxed">
              On the next compact, the checkpoint and newly aged-out turns are
              summarized together. Recent turns keep moving through the keep
              zone unchanged.
            </p>
            <div className="mt-3 flex items-center gap-2 text-[0.625rem] font-medium">
              <FlowChip label="Current checkpoint" />
              <span className="text-muted-foreground">+</span>
              <FlowChip label="Newly aged turns" />
              <ArrowRightIcon className="text-primary size-3.5 shrink-0" />
              <FlowChip label="Refined checkpoint" accent />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExecutionStep({
  text,
  busy,
  applying,
  preparing,
  error,
  keptTurns,
  onRegenerate,
}: {
  text: string;
  busy: boolean;
  applying: boolean;
  preparing: boolean;
  error: string | null;
  keptTurns: number;
  onRegenerate: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-xl border bg-background/40">
      <div className="flex h-12 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">Live checkpoint</span>
          {busy ? (
            <span className="text-primary flex items-center gap-1.5 text-[0.6875rem]">
              <Spinner className="size-3" />
              {applying ? "Creating copy" : preparing ? "Preparing" : "Streaming"}
            </span>
          ) : text && !error ? (
            <span className="text-muted-foreground text-[0.6875rem]">
              Ready to apply · {keptTurns} recent {keptTurns === 1 ? "turn" : "turns"} kept
            </span>
          ) : null}
        </div>
        {text && !busy ? (
          <Button variant="ghost" size="sm" onClick={onRegenerate}>
            <RefreshCwIcon className="size-3.5" />
            Regenerate
          </Button>
        ) : null}
      </div>
      <div className="relative min-h-[25rem] overflow-y-auto p-6">
        {preparing ? (
          <ExecutionPlaceholder
            icon={<Spinner className="text-primary size-5" />}
            title="Resolving thread context"
            copy="Rendering variables, skills, and included files before compaction."
          />
        ) : error ? (
          <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-xs">
            {error}
          </div>
        ) : text ? (
          <Markdown
            className={cn(
              "mx-auto max-w-2xl pb-6 [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-sm [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-xs",
              busy &&
                "after:bg-primary after:ml-1 after:inline-block after:h-4 after:w-0.5 after:animate-pulse"
            )}
          >
            {text}
          </Markdown>
        ) : (
          <ExecutionPlaceholder
            icon={<SparklesIcon className="text-primary size-5" />}
            title="Writing checkpoint"
            copy="The structured checkpoint will stream here as it is generated."
          />
        )}
      </div>
    </div>
  );
}

function DiagramCard({
  icon,
  eyebrow,
  title,
  children,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-background/65 rounded-xl border p-4 shadow-sm">
      <div className="text-muted-foreground flex items-center gap-2 text-[0.625rem] font-medium tracking-wider uppercase">
        {icon}
        {eyebrow}
      </div>
      <div className="mt-1 text-xs font-semibold">{title}</div>
      {children}
    </div>
  );
}

function IntroPrinciple({
  icon,
  title,
  copy,
}: {
  icon: ReactNode;
  title: string;
  copy: string;
}) {
  return (
    <div className="p-3.5">
      <div className="text-primary mb-2">{icon}</div>
      <div className="text-xs font-medium">{title}</div>
      <p className="text-muted-foreground mt-1 text-[0.6875rem]/relaxed">
        {copy}
      </p>
    </div>
  );
}

function HistoryPanel({
  title,
  badge,
  accent = false,
  children,
}: {
  title: string;
  badge: string;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        accent ? "border-primary/20 bg-primary/[0.025]" : "bg-background/40"
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold">{title}</span>
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[0.5625rem] font-medium">
          {badge}
        </span>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function TurnStack({
  count,
  tone,
}: {
  count: number;
  tone: "muted" | "primary";
}) {
  const visibleCount = Math.min(3, Math.max(1, count));
  return (
    <div className="space-y-1.5">
      {Array.from({ length: visibleCount }, (_, index) => (
        <MiniTurn
          key={index}
          tone={tone}
          width={index % 2 === 0 ? "w-full" : "w-4/5"}
        />
      ))}
      {count > visibleCount ? (
        <div className="text-muted-foreground pt-0.5 text-center text-[0.5625rem]">
          +{count - visibleCount} more
        </div>
      ) : null}
    </div>
  );
}

function MiniTurn({
  tone,
  width,
}: {
  tone: "muted" | "primary";
  width: string;
}) {
  return (
    <div
      className={cn(
        "flex h-7 items-center gap-2 rounded-md border px-2",
        width,
        tone === "primary"
          ? "border-primary/20 bg-primary/[0.06]"
          : "border-border/60 bg-muted/25"
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          tone === "primary" ? "bg-primary/60" : "bg-muted-foreground/35"
        )}
      />
      <span
        className={cn(
          "h-1.5 rounded-full",
          tone === "primary" ? "bg-primary/25" : "bg-muted-foreground/20",
          width === "w-full" ? "w-3/5" : "w-1/2"
        )}
      />
    </div>
  );
}

function MessageBlock({ label }: { label: string }) {
  return (
    <div className="border-amber-400/20 bg-amber-400/[0.05] text-amber-200/80 flex h-8 items-center gap-2 rounded-md border px-2 text-[0.625rem]">
      <FileStackIcon className="size-3" />
      {label}
    </div>
  );
}

function FlowChip({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <span
      className={cn(
        "min-w-0 rounded-md border px-2 py-1 text-center",
        accent
          ? "border-primary/25 bg-primary/10 text-primary"
          : "border-border/60 bg-background/60 text-muted-foreground"
      )}
    >
      {label}
    </span>
  );
}

function ExecutionPlaceholder({
  icon,
  title,
  copy,
}: {
  icon: ReactNode;
  title: string;
  copy: string;
}) {
  return (
    <div className="text-muted-foreground flex min-h-[22rem] flex-col items-center justify-center gap-3 text-center">
      <div className="border-primary/15 bg-primary/[0.06] flex size-11 items-center justify-center rounded-xl border">
        {icon}
      </div>
      <div>
        <div className="text-foreground text-xs font-medium">{title}</div>
        <div className="mt-1 text-[0.6875rem]">{copy}</div>
      </div>
    </div>
  );
}

function _formatTurns(count: number): string {
  return `${count} ${count === 1 ? "turn" : "turns"}`;
}
