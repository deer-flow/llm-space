import {
  CheckIcon,
  GitCompareArrowsIcon,
  RotateCcwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { format } from "timeago.js";

import { cn } from "@/lib/utils";

import { useAutoAnimation } from "../../lib/use-auto-animation";
import { ConfirmDialog } from "../confirm-dialog";
import { Tooltip } from "../tooltip";
import { Button } from "../ui/button";
import { Item, ItemContent, ItemDescription, ItemGroup } from "../ui/item";

import { RunEvaluationDialog } from "./run-evaluation-dialog";
import {
  runMessageCountLabel,
  runModelLabel,
  summarizeRun,
} from "./run-history-utils";
import { useThreadStore, useThreadStoreActions } from "./stores";
import type { EvaluationRecord, RunSnapshot } from "./stores";

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
  const { restoreThread, removeRun, saveEvaluation } = useThreadStoreActions();
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [evaluationOpen, setEvaluationOpen] = useState(false);
  const [runPendingRemoval, setRunPendingRemoval] =
    useState<RunSnapshot | null>(null);
  const runs = useMemo(() => runHistory.slice().reverse(), [runHistory]);
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
    return _findEvaluation(
      evaluations,
      comparisonRuns[0].id,
      comparisonRuns[1].id
    );
  }, [comparisonRuns, evaluations]);

  useEffect(() => {
    setSelectedRunIds((current) => current.filter((id) => runById.has(id)));
  }, [runById]);

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
              <_RunHistoryItem
                key={run.id}
                run={run}
                newest={index === 0}
                selected={selectedRunIds.includes(run.id)}
                onToggleSelected={toggleRunSelection}
                onRestore={(thread) => restoreThread(thread)}
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
          />
        )}
      </div>
      <RunEvaluationDialog
        open={evaluationOpen}
        leftRun={comparisonRuns?.[0] ?? null}
        rightRun={comparisonRuns?.[1] ?? null}
        evaluation={selectedEvaluation}
        onOpenChange={setEvaluationOpen}
        onSave={saveEvaluation}
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
    </div>
  );
}

export const RunHistoryListView = memo(_RunHistoryListView);

function _RunHistoryItem({
  run,
  newest,
  selected,
  onToggleSelected,
  onRestore,
  onRequestRemove,
}: {
  run: RunSnapshot;
  newest: boolean;
  selected: boolean;
  onToggleSelected: (runId: string) => void;
  onRestore: (thread: RunSnapshot["thread"]) => void;
  onRequestRemove: (run: RunSnapshot) => void;
}) {
  const summary = summarizeRun(run.thread);
  const modelLabel = runModelLabel(run.thread);
  const messageCountLabel = runMessageCountLabel(run.thread);
  const time = format(run.timestamp);
  return (
    <Item
      size="sm"
      variant="muted"
      role="listitem"
      className={cn(
        "group relative flex-col items-start gap-1",
        selected && "ring-primary/50 ring-1",
        // Flash the newest run's background, fading to the resting color.
        newest && "animate-run-history-enter"
      )}
    >
      <div className="flex w-full min-w-0 items-start gap-2">
        <ItemContent className="min-w-0 flex-1">
          <ItemDescription className="text-foreground/60 group-hover:text-foreground line-clamp-2 w-full font-mono">
            {summary}
          </ItemDescription>
        </ItemContent>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip content={selected ? "Remove from comparison" : "Select run"}>
            <Button
              variant={selected ? "default" : "outline"}
              size="icon-xs"
              className={cn(
                "pointer-events-none opacity-0 shadow-sm transition-opacity",
                "group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100",
                selected && "pointer-events-auto opacity-100"
              )}
              aria-label={
                selected
                  ? `Remove run from comparison: ${summary}`
                  : `Select run for comparison: ${summary}`
              }
              aria-pressed={selected}
              onClick={() => onToggleSelected(run.id)}
            >
              {selected && <CheckIcon className="size-2" />}
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
      </div>
      <div className="text-muted-foreground flex w-full min-w-0 items-baseline gap-1.5 text-[0.625rem]">
        <span className="min-w-0 flex-1 truncate">
          {time} · {modelLabel}
        </span>
        <span className="shrink-0 tabular-nums">{messageCountLabel}</span>
      </div>
    </Item>
  );
}

function _EvaluationList({
  evaluations,
  runById,
  onOpenEvaluation,
}: {
  evaluations: EvaluationRecord[];
  runById: Map<string, RunSnapshot>;
  onOpenEvaluation: (leftRunId: string, rightRunId: string) => void;
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
          <Item
            key={evaluation.id}
            size="sm"
            variant="outline"
            asChild
            className="hover:bg-foreground/5! cursor-pointer flex-col items-start gap-1"
          >
            <button
              type="button"
              aria-label={`Open saved evaluation: ${VERDICT_LABELS[evaluation.verdict]}`}
              onClick={() =>
                onOpenEvaluation(evaluation.leftRunId, evaluation.rightRunId)
              }
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-xs font-medium">
                  {VERDICT_LABELS[evaluation.verdict]}
                </span>
                <span className="text-muted-foreground shrink-0 text-[0.625rem]">
                  {format(evaluation.updatedAt)}
                </span>
              </div>
              <div className="text-muted-foreground line-clamp-2 w-full text-left font-mono text-[0.625rem]">
                A: {summarizeRun(leftRun.thread)}
                {"\n"}B: {summarizeRun(rightRun.thread)}
              </div>
              {evaluation.note && (
                <div className="text-foreground/70 line-clamp-2 w-full text-left text-[0.625rem]">
                  {evaluation.note}
                </div>
              )}
            </button>
          </Item>
        ))}
      </ItemGroup>
    </div>
  );
}

/** Find a saved evaluation for the currently selected left/right run pair. */
function _findEvaluation(
  evaluations: EvaluationRecord[],
  leftRunId: string,
  rightRunId: string
): EvaluationRecord | null {
  return (
    evaluations.find(
      (evaluation) =>
        evaluation.leftRunId === leftRunId &&
        evaluation.rightRunId === rightRunId
    ) ?? null
  );
}
