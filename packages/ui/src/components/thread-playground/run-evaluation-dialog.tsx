import {
  completeRunScores,
  initialRubricForEvaluation,
  requiresScoreRemovalConfirmation,
  runLastUserText,
  runMessageCountLabel,
  runModelLabel,
  runResultText,
  scoreDraftForRubricChange,
  scoreDraftFromEvaluation,
  snapshotEvaluationRubric,
  summarizeRun,
  type EvaluationRecord,
  type EvaluationRubricInput,
  type EvaluationRubricRecord,
  type EvaluationRubricSnapshot,
  type EvaluationRunScores,
  type EvaluationScoreDraft,
  type RunSnapshot,
} from "@llm-space/core/thread";
import { ArrowLeftIcon, CheckIcon, EyeIcon, SaveIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { format } from "timeago.js";

import { ConfirmDialog } from "@llm-space/ui/components/confirm-dialog";
import { formatString, langToTimeago, useI18n } from "@llm-space/ui/lib/i18n";
import { cn } from "@llm-space/ui/lib/utils";
import { Button } from "@llm-space/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";
import { Textarea } from "@llm-space/ui/ui/textarea";



import { EvaluationRubricEditor } from "./evaluation-rubric-editor";
import { RunEvaluationScorecard } from "./run-evaluation-scorecard";
import { RunTraceView } from "./run-trace-view";

const VERDICT_OPTIONS: EvaluationRecord["verdict"][] = [
  "leftBetter",
  "rightBetter",
  "tie",
  "pass",
  "fail",
];

export function RunEvaluationDialog({
  open,
  leftRun,
  rightRun,
  evaluation,
  rubrics,
  preferredRubricId,
  onOpenChange,
  onSave,
  onSaveRubric,
  onRemoveRubric,
}: {
  open: boolean;
  leftRun: RunSnapshot | null;
  rightRun: RunSnapshot | null;
  evaluation: EvaluationRecord | null;
  rubrics: EvaluationRubricRecord[];
  preferredRubricId: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (input: {
    leftRunId: string;
    rightRunId: string;
    verdict: EvaluationRecord["verdict"];
    note?: string;
    rubric?: EvaluationRubricSnapshot;
    runScores?: EvaluationRunScores[];
  }) => boolean;
  onSaveRubric: (input: EvaluationRubricInput) => EvaluationRubricRecord | null;
  onRemoveRubric: (id: string) => boolean;
}) {
  const [verdict, setVerdict] = useState<EvaluationRecord["verdict"] | null>(
    null
  );
  const [note, setNote] = useState("");
  const [inspectingRun, setInspectingRun] = useState<RunSnapshot | null>(null);
  const [rubricEditorOpen, setRubricEditorOpen] = useState(false);
  const [editingRubric, setEditingRubric] =
    useState<EvaluationRubricRecord | null>(null);
  const [selectedRubric, setSelectedRubric] =
    useState<EvaluationRubricSnapshot | null>(null);
  const [scoreDraft, setScoreDraft] = useState<EvaluationScoreDraft>({});
  const [removeScoresOpen, setRemoveScoresOpen] = useState(false);

  const [prevOpen, setPrevOpen] = useState(false);
  const identity = `${leftRun?.id ?? ""}:${rightRun?.id ?? ""}:${evaluation?.id ?? ""}`;
  const [prevIdentity, setPrevIdentity] = useState(identity);
  const { t, lang } = useI18n();

  // Reinitialize the dialog when it opens or the run/evaluation identity changes. Adjusting
  // during render (not via useEffect) avoids a stale frame between the two
  // commits. See https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (open !== prevOpen || identity !== prevIdentity) {
    setPrevOpen(open);
    setPrevIdentity(identity);
    setInspectingRun(null);
    setRubricEditorOpen(false);
    setEditingRubric(null);
    setRemoveScoresOpen(false);
    if (open) {
      const preferredRubric = preferredRubricId
        ? rubrics.find((rubric) => rubric.id === preferredRubricId)
        : undefined;
      setVerdict(evaluation?.verdict ?? null);
      setNote(evaluation?.note ?? "");
      setSelectedRubric(
        initialRubricForEvaluation(
          evaluation,
          preferredRubric ? snapshotEvaluationRubric(preferredRubric) : null
        )
      );
      setScoreDraft(scoreDraftFromEvaluation(evaluation));
    }
  }

  const title = useMemo(() => {
    if (!leftRun || !rightRun) {
      return t.playground.eval.compareRunsTitle;
    }
    return formatString(t.playground.eval.runComparisonTitle, {
      left: format(leftRun.timestamp, langToTimeago(lang)),
      right: format(rightRun.timestamp, langToTimeago(lang)),
    });
  }, [lang, leftRun, rightRun, t]);

  const runScores = useMemo(() => {
    if (!selectedRubric || !leftRun || !rightRun) {
      return null;
    }
    return completeRunScores(selectedRubric, scoreDraft, [
      leftRun.id,
      rightRun.id,
    ]);
  }, [leftRun, rightRun, scoreDraft, selectedRubric]);
  const canSave = Boolean(verdict && (!selectedRubric || runScores !== null));

  const handleRubricChange = (rubric: EvaluationRubricSnapshot | null) => {
    if (leftRun && rightRun) {
      setScoreDraft((current) =>
        scoreDraftForRubricChange(
          current,
          selectedRubric,
          rubric,
          [leftRun.id, rightRun.id],
          evaluation
        )
      );
    }
    setSelectedRubric(rubric);
  };

  const persistEvaluation = () => {
    if (!leftRun || !rightRun || !verdict) {
      return;
    }
    if (selectedRubric && !runScores) {
      return;
    }
    const saved = onSave({
      leftRunId: leftRun.id,
      rightRunId: rightRun.id,
      verdict,
      note,
      ...(selectedRubric && runScores
        ? { rubric: selectedRubric, runScores }
        : {}),
    });
    if (!saved) {
      toast.error(t.playground.eval.unableToSaveEvaluation, {
        description: t.playground.eval.checkRunsAndRubricScores,
      });
      return;
    }
    toast.success(t.playground.eval.evaluationSaved);
    onOpenChange(false);
  };

  const handleSave = () => {
    if (requiresScoreRemovalConfirmation(evaluation, selectedRubric)) {
      setRemoveScoresOpen(true);
      return;
    }
    persistEvaluation();
  };

  const dialogTitle = inspectingRun
    ? t.playground.eval.inspectRun
    : rubricEditorOpen
      ? editingRubric
        ? t.playground.eval.editRubric
        : t.playground.eval.createRubric
      : t.playground.eval.evaluateRuns;
  const dialogDescription = inspectingRun
    ? t.playground.eval.inspectRunDescription
    : rubricEditorOpen
      ? t.playground.eval.editRubricDescription
      : t.playground.eval.evaluateRunsDescription;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-4rem)] w-[min(1040px,calc(100vw-2rem))] max-w-none! flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        {inspectingRun ? (
          <>
            <RunTraceView className="min-h-0 flex-1" run={inspectingRun} />
            <div className="flex justify-end border-t px-4 py-3">
              <Button variant="ghost" onClick={() => setInspectingRun(null)}>
                <ArrowLeftIcon className="size-3" />
                {t.playground.eval.backToEvaluation}
              </Button>
            </div>
          </>
        ) : rubricEditorOpen ? (
          <EvaluationRubricEditor
            key={editingRubric?.id ?? "new-rubric"}
            rubric={editingRubric}
            onBack={() => setRubricEditorOpen(false)}
            onSave={onSaveRubric}
            onRemove={(id) => {
              const removed = onRemoveRubric(id);
              const savedSnapshot = evaluation?.rubric;
              if (
                removed &&
                selectedRubric?.id === id &&
                (savedSnapshot?.id !== selectedRubric.id ||
                  savedSnapshot?.revision !== selectedRubric.revision)
              ) {
                setSelectedRubric(null);
              }
              return removed;
            }}
            onSaved={(rubric) => {
              const snapshot = snapshotEvaluationRubric(rubric);
              handleRubricChange(snapshot);
              setEditingRubric(rubric);
              setRubricEditorOpen(false);
            }}
          />
        ) : leftRun && rightRun ? (
          <>
            <div className="min-h-0 overflow-y-auto px-4 py-4">
              <div className="text-muted-foreground mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>{title}</span>
                {evaluation && (
                  <span>
                    {formatString(t.playground.eval.lastSaved, {
                      time: format(
                        evaluation.updatedAt,
                        langToTimeago(lang)
                      ),
                    })}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-3 lg:flex-row">
                <_RunComparisonPanel
                  label={t.playground.eval.runA}
                  run={leftRun}
                  onInspectRun={setInspectingRun}
                />
                <_RunComparisonPanel
                  label={t.playground.eval.runB}
                  run={rightRun}
                  onInspectRun={setInspectingRun}
                />
              </div>
              <div className="mt-4 flex flex-col gap-3">
                <RunEvaluationScorecard
                  rubrics={rubrics}
                  savedRubric={evaluation?.rubric ?? null}
                  rubric={selectedRubric}
                  leftRunId={leftRun.id}
                  rightRunId={rightRun.id}
                  scoreDraft={scoreDraft}
                  onRubricChange={handleRubricChange}
                  onScoreChange={(runId, criterionId, score) =>
                    setScoreDraft((current) => ({
                      ...current,
                      [runId]: {
                        ...(current[runId] ?? {}),
                        [criterionId]: score,
                      },
                    }))
                  }
                  onCreateRubric={() => {
                    setEditingRubric(null);
                    setRubricEditorOpen(true);
                  }}
                  onEditRubric={(rubric) => {
                    setEditingRubric(rubric);
                    setRubricEditorOpen(true);
                  }}
                />
                <div>
                  <div className="text-xs font-medium">
                    {t.playground.eval.verdictLabel}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {VERDICT_OPTIONS.map((value) => {
                      const selected = verdict === value;
                      return (
                        <Button
                          key={value}
                          type="button"
                          variant={selected ? "default" : "outline"}
                          aria-pressed={selected}
                          onClick={() => setVerdict(value)}
                        >
                          {selected && <CheckIcon className="size-3" />}
                          {t.playground.eval.verdict[value]}
                        </Button>
                      );
                    })}
                  </div>
                </div>
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-medium">
                    {t.playground.eval.evaluationNote}
                  </span>
                  <Textarea
                    className="min-h-24"
                    value={note}
                    placeholder={t.playground.eval.evaluationNotePlaceholder}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t px-4 py-3">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {t.playground.eval.close}
              </Button>
              <Button disabled={!canSave} onClick={handleSave}>
                <SaveIcon className="size-3" />
                {t.playground.eval.saveEvaluation}
              </Button>
            </div>
          </>
        ) : (
          <div className="text-muted-foreground px-4 py-8 text-center text-xs">
            {t.playground.eval.selectTwoRunsToCompare}
          </div>
        )}
      </DialogContent>
      <ConfirmDialog
        open={removeScoresOpen}
        onOpenChange={setRemoveScoresOpen}
        title={t.playground.eval.removeRubricScoresTitle}
        description={t.playground.eval.removeRubricScoresDescription}
        confirmLabel={t.playground.eval.removeScoresAndSave}
        dimBackground={false}
        onConfirm={() => {
          setRemoveScoresOpen(false);
          persistEvaluation();
        }}
      />
    </Dialog>
  );
}

function _RunComparisonPanel({
  label,
  run,
  onInspectRun,
}: {
  label: string;
  run: RunSnapshot;
  onInspectRun: (run: RunSnapshot) => void;
}) {
  const { t, lang } = useI18n();
  return (
    <section className="bg-muted/30 flex min-w-0 flex-1 flex-col rounded-lg border">
      <div className="border-b px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium">{label}</div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={formatString(t.playground.eval.inspectWithSummary, {
                label,
                summary: summarizeRun(run.thread),
              })}
              onClick={() => onInspectRun(run)}
            >
              <EyeIcon className="size-3" />
              {t.playground.eval.inspect}
            </Button>
            <div className="text-muted-foreground text-[0.625rem]">
              {format(run.timestamp, langToTimeago(lang))}
            </div>
          </div>
        </div>
        <div className="text-muted-foreground mt-1 line-clamp-2 font-mono text-xs">
          {summarizeRun(run.thread)}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-b px-3 py-2 text-[0.625rem]">
        <_MetaValue label={t.playground.eval.model} value={runModelLabel(run.thread)} />
        <_MetaValue
          label={t.playground.eval.messages}
          value={runMessageCountLabel(run.thread)}
        />
        <_MetaValue
          label={t.playground.eval.captured}
          value={new Date(run.timestamp).toLocaleString()}
        />
      </div>
      <div className="flex min-h-0 flex-col gap-3 p-3">
        <_TextExcerpt
          label={t.playground.eval.systemPrompt}
          value={
            run.thread.context?.systemPrompt?.trim() ||
            t.playground.eval.noSystemPrompt
          }
        />
        <_TextExcerpt
          label={t.playground.eval.lastUserMessage}
          value={runLastUserText(run.thread)}
        />
        <_TextExcerpt
          label={t.playground.eval.result}
          value={runResultText(run.thread)}
        />
      </div>
    </section>
  );
}

function _MetaValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-1">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="truncate">{value}</span>
    </div>
  );
}

function _TextExcerpt({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-0 flex-col gap-1">
      <div className="text-muted-foreground text-[0.625rem] font-medium">
        {label}
      </div>
      <pre
        className={cn(
          "bg-background/70 max-h-40 overflow-auto rounded-md border px-2 py-2",
          "font-mono text-[0.6875rem] leading-relaxed whitespace-pre-wrap"
        )}
      >
        {value}
      </pre>
    </div>
  );
}
