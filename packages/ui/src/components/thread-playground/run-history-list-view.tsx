import {
  averageScoreForRun,
  evaluationScoreDelta,
  findEvaluationForPair,
  preferredEvaluationRubricId,
  runEntryMessageCountLabel,
  runEntryModelLabel,
  runEntrySummary,
  type EvaluationRecord,
  type RunHistoryEntry,
  type RunSnapshot,
} from "@llm-space/core/thread";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  GitCompareArrowsIcon,
  RotateCcwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { toast } from "sonner";
import { format } from "timeago.js";

import { ConfirmDialog } from "@llm-space/ui/components/confirm-dialog";
import { Tooltip } from "@llm-space/ui/components/tooltip";
import { formatString, langToTimeago, useI18n } from "@llm-space/ui/lib/i18n";
import { useAutoAnimation } from "@llm-space/ui/lib/use-auto-animation";
import { cn } from "@llm-space/ui/lib/utils";
import { Button } from "@llm-space/ui/ui/button";
import { Item, ItemContent, ItemDescription, ItemGroup } from "@llm-space/ui/ui/item";

import { RunEvaluationDialog } from "./run-evaluation-dialog";
import { RunTraceView } from "./run-trace-view";
import { useThreadStore, useThreadStoreActions } from "./stores";

function _RunHistoryListView({ onClose }: { onClose: () => void }) {
  const [containerRef] = useAutoAnimation();
  const { t } = useI18n();
  const runHistory = useThreadStore((s) => s.runHistory);
  const evaluations = useThreadStore((s) => s.evaluations);
  const evaluationRubrics = useThreadStore((s) => s.evaluationRubrics);
  const {
    restoreThread,
    loadRunSnapshot,
    removeRun,
    saveEvaluation,
    removeEvaluation,
    saveEvaluationRubric,
    removeEvaluationRubric,
  } = useThreadStoreActions();
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [evaluationOpen, setEvaluationOpen] = useState(false);
  const [inspectingRunId, setInspectingRunId] = useState<string | null>(null);
  const [inspectingRun, setInspectingRun] = useState<RunSnapshot | null>(null);
  const [comparisonRuns, setComparisonRuns] = useState<
    [RunSnapshot, RunSnapshot] | null
  >(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [runPendingRemoval, setRunPendingRemoval] =
    useState<RunHistoryEntry | null>(null);
  const [evaluationPendingRemoval, setEvaluationPendingRemoval] =
    useState<EvaluationRecord | null>(null);
  const runs = useMemo(() => runHistory.slice().reverse(), [runHistory]);
  const inspectingRunIndex = useMemo(() => {
    if (!inspectingRunId) {
      return -1;
    }
    return runs.findIndex((run) => run.id === inspectingRunId);
  }, [inspectingRunId, runs]);
  const inspectingRunEntry =
    inspectingRunIndex >= 0 ? runs[inspectingRunIndex] : null;
  const canInspectPrevious = inspectingRunIndex > 0;
  const canInspectNext =
    inspectingRunIndex >= 0 && inspectingRunIndex < runs.length - 1;
  const runById = useMemo(() => {
    return new Map(runHistory.map((run) => [run.id, run]));
  }, [runHistory]);
  const selectedRuns = useMemo(() => {
    return selectedRunIds
      .map((id) => runById.get(id))
      .filter((run): run is RunHistoryEntry => Boolean(run));
  }, [runById, selectedRunIds]);
  const selectedEvaluation = useMemo(() => {
    if (selectedRuns.length !== 2) {
      return null;
    }
    return findEvaluationForPair(
      evaluations,
      selectedRuns[0].id,
      selectedRuns[1].id
    );
  }, [evaluations, selectedRuns]);
  const preferredRubricId = useMemo(
    () => preferredEvaluationRubricId(evaluations, evaluationRubrics),
    [evaluationRubrics, evaluations]
  );

  useEffect(() => {
    setSelectedRunIds((current) => current.filter((id) => runById.has(id)));
  }, [runById]);
  useEffect(() => {
    if (inspectingRunId && inspectingRunIndex === -1) {
      setInspectingRunId(null);
    }
  }, [inspectingRunId, inspectingRunIndex]);
  useEffect(() => {
    setInspectingRun(null);
    if (!inspectingRunEntry) return;
    let current = true;
    void loadRunSnapshot(inspectingRunEntry)
      .then((run) => {
        if (current) setInspectingRun(run);
      })
      .catch((error) => {
        if (!current) return;
        setInspectingRunId(null);
        toast.error(t.playground.runHistory.failedToLoadRunSnapshot, {
          description:
            error instanceof Error
              ? error.message
              : t.playground.message.pleaseTryAgain,
        });
      });
    return () => {
      current = false;
    };
  }, [inspectingRunEntry, loadRunSnapshot, t]);
  useEffect(() => {
    setComparisonRuns(null);
  }, [selectedRunIds]);

  const toggleRunSelection = useCallback((runId: string) => {
    setSelectedRunIds((current) => {
      if (current.includes(runId)) {
        return current.filter((id) => id !== runId);
      }
      if (current.length >= 2) {
        return [current[1], runId];
      }
      return [...current, runId];
    });
  }, []);

  const loadComparison = useCallback(
    async (entries: RunHistoryEntry[]) => {
      if (entries.length !== 2) return;
      setComparisonLoading(true);
      try {
        const loaded = await Promise.all(entries.map(loadRunSnapshot));
        setComparisonRuns([loaded[0], loaded[1]]);
        setEvaluationOpen(true);
      } catch (error) {
        toast.error(t.playground.runHistory.failedToLoadRunSnapshots, {
          description:
            error instanceof Error
              ? error.message
              : t.playground.message.pleaseTryAgain,
        });
      } finally {
        setComparisonLoading(false);
      }
    },
    [loadRunSnapshot, t]
  );
  const openEvaluation = useCallback(
    (leftRunId: string, rightRunId: string) => {
      setSelectedRunIds([leftRunId, rightRunId]);
      const leftRun = runById.get(leftRunId);
      const rightRun = runById.get(rightRunId);
      if (leftRun && rightRun) {
        void loadComparison([leftRun, rightRun]);
      }
    },
    [loadComparison, runById]
  );

  const handleCompareSelected = useCallback(() => {
    void loadComparison(selectedRuns);
  }, [loadComparison, selectedRuns]);
  const handleRestoreRun = useCallback(
    async (run: RunHistoryEntry) => {
      try {
        restoreThread((await loadRunSnapshot(run)).thread);
      } catch (error) {
        toast.error(t.playground.runHistory.failedToLoadRunSnapshot, {
          description:
            error instanceof Error
              ? error.message
              : t.playground.message.pleaseTryAgain,
        });
      }
    },
    [loadRunSnapshot, restoreThread, t]
  );
  const inspectRunFromHistory = useCallback((run: RunHistoryEntry) => {
    setComparisonRuns(null);
    setInspectingRunId(run.id);
  }, []);
  const handleBackToHistory = useCallback(() => {
    setInspectingRunId(null);
  }, []);
  const inspectPreviousRun = useCallback(() => {
    if (canInspectPrevious) {
      setInspectingRunId(runs[inspectingRunIndex - 1].id);
    }
  }, [canInspectPrevious, inspectingRunIndex, runs]);
  const inspectNextRun = useCallback(() => {
    if (canInspectNext) {
      setInspectingRunId(runs[inspectingRunIndex + 1].id);
    }
  }, [canInspectNext, inspectingRunIndex, runs]);
  const handleEvaluationOpenChange = useCallback((open: boolean) => {
    setEvaluationOpen(open);
    if (!open) setComparisonRuns(null);
  }, []);

  if (inspectingRunId) {
    return (
      <div className="flex size-full flex-col">
        <div className="text-muted-foreground flex h-12 shrink-0 items-center gap-1 border-b px-2 text-sm">
          <Button
            variant="ghost"
            size="sm"
            aria-label={t.playground.runHistory.backToRunHistory}
            onClick={handleBackToHistory}
          >
            <ArrowLeftIcon className="size-3" />
            {t.playground.runHistory.back}
          </Button>
          <div className="min-w-0 flex-1 px-1">
            <div className="text-foreground truncate text-sm">
              {t.playground.runHistory.inspectRun}
            </div>
            <div className="text-muted-foreground text-[0.625rem]">
              {formatString(t.playground.message.indexOfTotal, {
                current: inspectingRunIndex + 1,
                total: runs.length,
              })}
            </div>
          </div>
          <Tooltip content={t.playground.runHistory.previousRun}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t.playground.runHistory.inspectPreviousRun}
              disabled={!canInspectPrevious}
              onClick={inspectPreviousRun}
            >
              <ChevronLeftIcon className="size-3" />
            </Button>
          </Tooltip>
          <Tooltip content={t.playground.runHistory.nextRun}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t.playground.runHistory.inspectNextRun}
              disabled={!canInspectNext}
              onClick={inspectNextRun}
            >
              <ChevronRightIcon className="size-3" />
            </Button>
          </Tooltip>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t.playground.runHistory.closeRunHistory}
            onClick={onClose}
          >
            <XIcon className="size-3" />
          </Button>
        </div>
        {inspectingRun ? (
          <RunTraceView className="min-h-0 flex-1" run={inspectingRun} />
        ) : (
          <div className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center text-xs">
            {t.playground.runHistory.loadingRunSnapshot}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex size-full flex-col">
      <div className="text-muted-foreground flex h-12 shrink-0 items-center justify-between border-b pl-3 text-sm">
        <div>{t.playground.runHistory.runHistory}</div>
        <div className="pr-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t.playground.runHistory.closeRunHistory}
            onClick={onClose}
          >
            <XIcon className="size-3" />
          </Button>
        </div>
      </div>
      <div className="border-b px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-medium">
              {t.playground.runHistory.compareRuns}
            </div>
            <div className="text-muted-foreground text-[0.625rem]">
              {formatString(t.playground.runHistory.selectedCount, {
                n: selectedRuns.length,
              })}
            </div>
          </div>
          <Button
            size="sm"
            disabled={selectedRuns.length !== 2 || comparisonLoading}
            onClick={handleCompareSelected}
          >
            <GitCompareArrowsIcon className="size-3" />
            {t.playground.runHistory.compare}
          </Button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="min-h-0 grow overflow-y-auto px-3 py-3.5"
      >
        <ItemGroup className="gap-3.5!">
          {runs.length === 0 ? (
            <div className="text-muted-foreground m-auto text-xs">
              {t.playground.runHistory.noRunsYet}
            </div>
          ) : (
            runs.map((run, index) => (
              <RunHistoryItem
                key={run.id}
                run={run}
                newest={index === 0}
                selected={selectedRunIds.includes(run.id)}
                onToggleSelected={toggleRunSelection}
                onInspectRun={inspectRunFromHistory}
                onRestore={handleRestoreRun}
                onRequestRemove={setRunPendingRemoval}
              />
            ))
          )}
        </ItemGroup>
        {evaluations.length > 0 && (
          <_EvaluationList
            evaluations={evaluations}
            runById={runById}
            onOpenEvaluation={openEvaluation}
            onRequestRemove={setEvaluationPendingRemoval}
          />
        )}
      </div>
      <RunEvaluationDialog
        open={evaluationOpen}
        leftRun={comparisonRuns?.[0] ?? null}
        rightRun={comparisonRuns?.[1] ?? null}
        evaluation={selectedEvaluation}
        rubrics={evaluationRubrics}
        preferredRubricId={preferredRubricId}
        onOpenChange={handleEvaluationOpenChange}
        onSave={saveEvaluation}
        onSaveRubric={saveEvaluationRubric}
        onRemoveRubric={removeEvaluationRubric}
      />
      <ConfirmDialog
        open={runPendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRunPendingRemoval(null);
          }
        }}
        title={t.playground.runHistory.removeRunTitle}
        description={t.playground.runHistory.removeRunDescription}
        confirmLabel={t.playground.runHistory.remove}
        onConfirm={() => {
          const run = runPendingRemoval;
          setRunPendingRemoval(null);
          if (run) {
            removeRun(run);
          }
        }}
      />
      <ConfirmDialog
        open={evaluationPendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEvaluationPendingRemoval(null);
          }
        }}
        title={t.playground.runHistory.removeEvaluationTitle}
        description={t.playground.runHistory.removeEvaluationDescription}
        confirmLabel={t.playground.runHistory.remove}
        onConfirm={() => {
          const evaluation = evaluationPendingRemoval;
          setEvaluationPendingRemoval(null);
          if (evaluation) {
            removeEvaluation(evaluation);
          }
        }}
      />
    </div>
  );
}

export const RunHistoryListView = memo(_RunHistoryListView);

function _RunHistoryItem({
  run,
  newest,
  selected,
  onToggleSelected,
  onInspectRun,
  onRestore,
  onRequestRemove,
}: {
  run: RunHistoryEntry;
  newest: boolean;
  selected: boolean;
  onToggleSelected: (runId: string) => void;
  onInspectRun: (run: RunHistoryEntry) => void;
  onRestore: (run: RunHistoryEntry) => void;
  onRequestRemove: (run: RunHistoryEntry) => void;
}) {
  const summary = runEntrySummary(run);
  const modelLabel = runEntryModelLabel(run);
  const messageCountLabel = runEntryMessageCountLabel(run);
  const { t, lang } = useI18n();
  const time = format(run.timestamp, langToTimeago(lang));
  const handleInspect = useCallback(() => {
    onInspectRun(run);
  }, [onInspectRun, run]);
  const handleInspectKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.currentTarget !== event.target) {
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onInspectRun(run);
      }
    },
    [onInspectRun, run]
  );
  const stopInspectClick = useCallback((event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  }, []);
  return (
    <Item
      size="sm"
      variant="muted"
      role="listitem"
      tabIndex={0}
      aria-label={formatString(t.playground.runHistory.inspectRunFrom, {
        time,
        summary,
      })}
      className={cn(
        "group hover:bg-muted/70 focus-visible:ring-ring relative cursor-pointer flex-col items-start gap-1.5 focus-visible:ring-[3px]",
        selected && "ring-primary/50 ring-1",
        // Flash the newest run's background, fading to the resting color.
        newest && "animate-run-history-enter"
      )}
      onClick={handleInspect}
      onKeyDown={handleInspectKeyDown}
    >
      <ItemContent className="flex w-full min-w-0 flex-row items-start gap-2">
        <ItemDescription className="text-foreground/60 group-hover:text-foreground line-clamp-2 min-w-0 flex-1 font-mono">
          {summary}
        </ItemDescription>
        <div className="shrink-0" onClick={stopInspectClick}>
          <Tooltip content={t.playground.runHistory.removeRun}>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                "hover:text-destructive pointer-events-none opacity-0 transition-opacity",
                "group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
              )}
              aria-label={formatString(t.playground.runHistory.removeRunFrom, {
                time,
              })}
              onClick={() => onRequestRemove(run)}
            >
              <Trash2Icon className="size-3" />
            </Button>
          </Tooltip>
        </div>
      </ItemContent>
      <div className="flex w-full min-w-0 items-end gap-2">
        <div className="text-muted-foreground min-w-0 flex-1 text-[0.625rem]">
          <div className="truncate">
            {time} · {modelLabel}
          </div>
          <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5">
            <span className="shrink-0 tabular-nums">{messageCountLabel}</span>
          </div>
        </div>
        <div
          className="flex shrink-0 items-center gap-0.5"
          onClick={stopInspectClick}
        >
          <Tooltip
            content={
              selected
                ? t.playground.runHistory.removeFromComparison
                : t.playground.runHistory.selectRun
            }
          >
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                "text-muted-foreground/70 hover:text-foreground opacity-70 transition-opacity",
                "group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100",
                selected && "text-primary opacity-100"
              )}
              aria-label={
                selected
                  ? formatString(
                      t.playground.runHistory.removeRunFromComparison,
                      { summary }
                    )
                  : formatString(
                      t.playground.runHistory.selectRunForComparison,
                      { summary }
                    )
              }
              aria-pressed={selected}
              onClick={() => onToggleSelected(run.id)}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-3 items-center justify-center rounded-[3px] border border-current",
                  selected &&
                    "border-primary bg-primary text-primary-foreground"
                )}
              >
                {selected && <CheckIcon className="size-2.5" />}
              </span>
            </Button>
          </Tooltip>
          <Tooltip content={t.playground.runHistory.inspectRunTooltip}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={formatString(t.playground.runHistory.inspectRunDetails, {
                time,
                summary,
                model: modelLabel,
                messages: messageCountLabel,
              })}
              onClick={() => onInspectRun(run)}
            >
              <EyeIcon className="size-3" />
            </Button>
          </Tooltip>
          <Tooltip content={t.playground.runHistory.restoreRun}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={formatString(t.playground.runHistory.restoreRunDetails, {
                time,
                summary,
                model: modelLabel,
                messages: messageCountLabel,
              })}
              onClick={() => onRestore(run)}
            >
              <RotateCcwIcon className="size-3" />
            </Button>
          </Tooltip>
        </div>
      </div>
    </Item>
  );
}

const RunHistoryItem = memo(_RunHistoryItem);

function _EvaluationList({
  evaluations,
  runById,
  onOpenEvaluation,
  onRequestRemove,
}: {
  evaluations: EvaluationRecord[];
  runById: Map<string, RunHistoryEntry>;
  onOpenEvaluation: (leftRunId: string, rightRunId: string) => void;
  onRequestRemove: (evaluation: EvaluationRecord) => void;
}) {
  const visibleEvaluations = evaluations
    .slice()
    .reverse()
    .flatMap((evaluation) => {
      const leftRun = runById.get(evaluation.leftRunId);
      const rightRun = runById.get(evaluation.rightRunId);
      return leftRun && rightRun ? [{ evaluation, leftRun, rightRun }] : [];
    });
  const { t } = useI18n();

  if (visibleEvaluations.length === 0) {
    return null;
  }

  return (
    <div className="mt-5 flex flex-col gap-2">
      <div className="text-muted-foreground text-xs font-medium">
        {t.playground.runHistory.evaluations}
      </div>
      <ItemGroup className="gap-2!">
        {visibleEvaluations.map(({ evaluation, leftRun, rightRun }) => (
          <EvaluationListItem
            key={evaluation.id}
            evaluation={evaluation}
            leftRun={leftRun}
            rightRun={rightRun}
            onOpenEvaluation={onOpenEvaluation}
            onRequestRemove={onRequestRemove}
          />
        ))}
      </ItemGroup>
    </div>
  );
}

function _EvaluationListItem({
  evaluation,
  leftRun,
  rightRun,
  onOpenEvaluation,
  onRequestRemove,
}: {
  evaluation: EvaluationRecord;
  leftRun: RunHistoryEntry;
  rightRun: RunHistoryEntry;
  onOpenEvaluation: (leftRunId: string, rightRunId: string) => void;
  onRequestRemove: (evaluation: EvaluationRecord) => void;
}) {
  const { t, lang } = useI18n();
  const verdictLabel = t.playground.eval.verdict[evaluation.verdict];
  const leftAverage = averageScoreForRun(
    evaluation.rubric,
    evaluation.runScores,
    evaluation.leftRunId
  );
  const rightAverage = averageScoreForRun(
    evaluation.rubric,
    evaluation.runScores,
    evaluation.rightRunId
  );
  const delta = evaluationScoreDelta(evaluation);
  const handleOpen = useCallback(() => {
    onOpenEvaluation(evaluation.leftRunId, evaluation.rightRunId);
  }, [evaluation.leftRunId, evaluation.rightRunId, onOpenEvaluation]);
  const handleOpenKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.currentTarget !== event.target) {
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleOpen();
      }
    },
    [handleOpen]
  );
  const stopOpenClick = useCallback((event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  }, []);
  return (
    <Item
      size="sm"
      variant="outline"
      role="listitem"
      tabIndex={0}
      aria-label={formatString(t.playground.runHistory.openSavedEvaluation, {
        verdict: verdictLabel,
      })}
      className="group hover:bg-foreground/5! focus-visible:ring-ring cursor-pointer flex-col items-start gap-1 focus-visible:ring-[3px]"
      onClick={handleOpen}
      onKeyDown={handleOpenKeyDown}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="text-xs font-medium">{verdictLabel}</span>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-muted-foreground text-[0.625rem]">
            {format(evaluation.updatedAt, langToTimeago(lang))}
          </span>
          <div onClick={stopOpenClick}>
            <Tooltip content={t.playground.runHistory.removeEvaluation}>
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(
                  "hover:text-destructive pointer-events-none opacity-0 transition-opacity",
                  "group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
                )}
                aria-label={formatString(
                  t.playground.runHistory.removeEvaluationWithVerdict,
                  { verdict: verdictLabel }
                )}
                onClick={() => onRequestRemove(evaluation)}
              >
                <Trash2Icon className="size-3" />
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>
      <div className="text-muted-foreground line-clamp-2 w-full font-mono text-[0.625rem]">
        {formatString(t.playground.runHistory.evaluationSummary, {
          left: runEntrySummary(leftRun),
          right: runEntrySummary(rightRun),
        })}
      </div>
      {evaluation.rubric &&
        leftAverage !== null &&
        rightAverage !== null &&
        delta !== null && (
          <div className="w-full text-[0.625rem]">
            <div className="text-muted-foreground truncate">
              {formatString(t.playground.eval.rubricOption, {
                name: evaluation.rubric.name,
                revision: evaluation.rubric.revision,
              })}
            </div>
            <div className="font-mono tabular-nums">
              {formatString(
                t.playground.runHistory.evaluationAverageSummary,
                {
                  a: leftAverage.toFixed(1),
                  b: rightAverage.toFixed(1),
                  sign: delta >= 0 ? "+" : "",
                  delta: delta.toFixed(1),
                }
              )}
            </div>
          </div>
        )}
      {evaluation.note && (
        <div className="text-foreground/70 line-clamp-2 w-full text-[0.625rem]">
          {evaluation.note}
        </div>
      )}
    </Item>
  );
}

const EvaluationListItem = memo(_EvaluationListItem);
