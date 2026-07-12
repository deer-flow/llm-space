import {
  type EvaluationRecord,
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
import { format } from "timeago.js";

import { cn } from "@/lib/utils";

import { useAutoAnimation } from "../../lib/use-auto-animation";
import { ConfirmDialog } from "../confirm-dialog";
import { Tooltip } from "../tooltip";
import { Button } from "../ui/button";
import { Item, ItemContent, ItemDescription, ItemGroup } from "../ui/item";

import { RunEvaluationDialog } from "./run-evaluation-dialog";
import {
  averageScoreForRun,
  evaluationScoreDelta,
  findEvaluationForPair,
  preferredEvaluationRubricId,
} from "./run-evaluation-utils";
import {
  runMessageCountLabel,
  runModelLabel,
  summarizeRun,
} from "./run-history-utils";
import { RunTraceView } from "./run-trace-view";
import { useThreadStore, useThreadStoreActions } from "./stores";

const VERDICT_LABELS: Record<EvaluationRecord["verdict"], string> = {
  leftBetter: "Run A Better",
  rightBetter: "Run B Better",
  tie: "Tie",
  pass: "Pass",
  fail: "Fail",
};

function _RunHistoryListView({ onClose }: { onClose: () => void }) {
  const [containerRef] = useAutoAnimation();
  const runHistory = useThreadStore((s) => s.runHistory);
  const evaluations = useThreadStore((s) => s.evaluations);
  const evaluationRubrics = useThreadStore((s) => s.evaluationRubrics);
  const {
    restoreThread,
    removeRun,
    saveEvaluation,
    removeEvaluation,
    saveEvaluationRubric,
    removeEvaluationRubric,
  } = useThreadStoreActions();
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [evaluationOpen, setEvaluationOpen] = useState(false);
  const [inspectingRunId, setInspectingRunId] = useState<string | null>(null);
  const [runPendingRemoval, setRunPendingRemoval] =
    useState<RunSnapshot | null>(null);
  const [evaluationPendingRemoval, setEvaluationPendingRemoval] =
    useState<EvaluationRecord | null>(null);
  const runs = useMemo(() => runHistory.slice().reverse(), [runHistory]);
  const inspectingRunIndex = useMemo(() => {
    if (!inspectingRunId) {
      return -1;
    }
    return runs.findIndex((run) => run.id === inspectingRunId);
  }, [inspectingRunId, runs]);
  const inspectingRun =
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
      .filter((run): run is RunSnapshot => Boolean(run));
  }, [runById, selectedRunIds]);
  const comparisonRuns =
    selectedRuns.length === 2 ? [selectedRuns[0], selectedRuns[1]] : null;
  const selectedEvaluation = useMemo(() => {
    if (!comparisonRuns) {
      return null;
    }
    return findEvaluationForPair(
      evaluations,
      comparisonRuns[0].id,
      comparisonRuns[1].id
    );
  }, [comparisonRuns, evaluations]);
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

  const openEvaluation = useCallback(
    (leftRunId: string, rightRunId: string) => {
      setSelectedRunIds([leftRunId, rightRunId]);
      setEvaluationOpen(true);
    },
    []
  );

  const handleCompareSelected = useCallback(() => {
    if (comparisonRuns) {
      setEvaluationOpen(true);
    }
  }, [comparisonRuns]);
  const handleRestoreRun = useCallback(
    (thread: RunSnapshot["thread"]) => {
      restoreThread(thread);
    },
    [restoreThread]
  );
  const inspectRunFromHistory = useCallback((run: RunSnapshot) => {
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

  if (inspectingRun) {
    return (
      <div className="flex size-full flex-col">
        <div className="text-muted-foreground flex h-12 shrink-0 items-center gap-1 border-b px-2 text-sm">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Back to run history"
            onClick={handleBackToHistory}
          >
            <ArrowLeftIcon className="size-3" />
            Back
          </Button>
          <div className="min-w-0 flex-1 px-1">
            <div className="text-foreground truncate text-sm">Inspect Run</div>
            <div className="text-muted-foreground text-[0.625rem]">
              {inspectingRunIndex + 1} of {runs.length}
            </div>
          </div>
          <Tooltip content="Previous run">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Inspect previous run"
              disabled={!canInspectPrevious}
              onClick={inspectPreviousRun}
            >
              <ChevronLeftIcon className="size-3" />
            </Button>
          </Tooltip>
          <Tooltip content="Next run">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Inspect next run"
              disabled={!canInspectNext}
              onClick={inspectNextRun}
            >
              <ChevronRightIcon className="size-3" />
            </Button>
          </Tooltip>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close run history"
            onClick={onClose}
          >
            <XIcon className="size-3" />
          </Button>
        </div>
        <RunTraceView className="min-h-0 flex-1" run={inspectingRun} />
      </div>
    );
  }

  return (
    <div className="flex size-full flex-col">
      <div className="text-muted-foreground flex h-12 shrink-0 items-center justify-between border-b pl-3 text-sm">
        <div>Run history</div>
        <div className="pr-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close run history"
            onClick={onClose}
          >
            <XIcon className="size-3" />
          </Button>
        </div>
      </div>
      <div className="border-b px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-medium">Compare Runs</div>
            <div className="text-muted-foreground text-[0.625rem]">
              {selectedRuns.length}/2 selected
            </div>
          </div>
          <Button
            size="sm"
            disabled={!comparisonRuns}
            onClick={handleCompareSelected}
          >
            <GitCompareArrowsIcon className="size-3" />
            Compare
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
              No runs yet
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
        onOpenChange={setEvaluationOpen}
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
        title="Remove Run?"
        description="This removes the saved run from this thread and removes any evaluations that reference it."
        confirmLabel="Remove"
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
        title="Remove Evaluation?"
        description="This removes the saved evaluation from this thread. The compared runs are kept."
        confirmLabel="Remove"
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
  run: RunSnapshot;
  newest: boolean;
  selected: boolean;
  onToggleSelected: (runId: string) => void;
  onInspectRun: (run: RunSnapshot) => void;
  onRestore: (thread: RunSnapshot["thread"]) => void;
  onRequestRemove: (run: RunSnapshot) => void;
}) {
  const summary = summarizeRun(run.thread);
  const modelLabel = runModelLabel(run.thread);
  const messageCountLabel = runMessageCountLabel(run.thread);
  const time = format(run.timestamp);
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
      aria-label={`Inspect run from ${time}: ${summary}`}
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
          <Tooltip content="Remove run">
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                "hover:text-destructive pointer-events-none opacity-0 transition-opacity",
                "group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
              )}
              aria-label={`Remove run from ${time}`}
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
          <Tooltip content={selected ? "Remove from comparison" : "Select run"}>
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
                  ? `Remove run from comparison: ${summary}`
                  : `Select run for comparison: ${summary}`
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
          <Tooltip content="Inspect run">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Inspect run from ${time}: ${summary}. ${modelLabel}. ${messageCountLabel}`}
              onClick={() => onInspectRun(run)}
            >
              <EyeIcon className="size-3" />
            </Button>
          </Tooltip>
          <Tooltip content="Restore run">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Restore run from ${time}: ${summary}. ${modelLabel}. ${messageCountLabel}`}
              onClick={() => onRestore(run.thread)}
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
  runById: Map<string, RunSnapshot>;
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

  if (visibleEvaluations.length === 0) {
    return null;
  }

  return (
    <div className="mt-5 flex flex-col gap-2">
      <div className="text-muted-foreground text-xs font-medium">
        Evaluations
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
  leftRun: RunSnapshot;
  rightRun: RunSnapshot;
  onOpenEvaluation: (leftRunId: string, rightRunId: string) => void;
  onRequestRemove: (evaluation: EvaluationRecord) => void;
}) {
  const verdictLabel = VERDICT_LABELS[evaluation.verdict];
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
      aria-label={`Open saved evaluation: ${verdictLabel}`}
      className="group hover:bg-foreground/5! focus-visible:ring-ring cursor-pointer flex-col items-start gap-1 focus-visible:ring-[3px]"
      onClick={handleOpen}
      onKeyDown={handleOpenKeyDown}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="text-xs font-medium">{verdictLabel}</span>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-muted-foreground text-[0.625rem]">
            {format(evaluation.updatedAt)}
          </span>
          <div onClick={stopOpenClick}>
            <Tooltip content="Remove evaluation">
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(
                  "hover:text-destructive pointer-events-none opacity-0 transition-opacity",
                  "group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
                )}
                aria-label={`Remove evaluation: ${verdictLabel}`}
                onClick={() => onRequestRemove(evaluation)}
              >
                <Trash2Icon className="size-3" />
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>
      <div className="text-muted-foreground line-clamp-2 w-full font-mono text-[0.625rem]">
        A: {summarizeRun(leftRun.thread)}
        {"\n"}B: {summarizeRun(rightRun.thread)}
      </div>
      {evaluation.rubric &&
        leftAverage !== null &&
        rightAverage !== null &&
        delta !== null && (
          <div className="w-full text-[0.625rem]">
            <div className="text-muted-foreground truncate">
              {evaluation.rubric.name} · v{evaluation.rubric.revision}
            </div>
            <div className="font-mono tabular-nums">
              A {leftAverage.toFixed(1)} · B {rightAverage.toFixed(1)} · Δ{" "}
              {delta >= 0 ? "+" : ""}
              {delta.toFixed(1)}
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
