import {
  MAX_EVALUATION_RUBRICS,
  snapshotEvaluationRubric,
  type EvaluationRubricRecord,
  type EvaluationRubricSnapshot,
} from "@llm-space/core/thread";
import { Edit3Icon, PlusIcon } from "lucide-react";
import { useMemo, type KeyboardEvent } from "react";

import { Tooltip } from "../tooltip";
import { Button } from "../ui/button";
import { ButtonGroup } from "../ui/button-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

import {
  averageScoreForRun,
  completeRunScores,
  type EvaluationScoreDraft,
} from "./run-evaluation-utils";

const NO_RUBRIC = "none";
const SAVED_RUBRIC = "saved";
const DEFINITION_PREFIX = "definition:";

export function RunEvaluationScorecard({
  rubrics,
  savedRubric,
  rubric,
  leftRunId,
  rightRunId,
  scoreDraft,
  onRubricChange,
  onScoreChange,
  onCreateRubric,
  onEditRubric,
}: {
  rubrics: EvaluationRubricRecord[];
  savedRubric: EvaluationRubricSnapshot | null;
  rubric: EvaluationRubricSnapshot | null;
  leftRunId: string;
  rightRunId: string;
  scoreDraft: EvaluationScoreDraft;
  onRubricChange: (rubric: EvaluationRubricSnapshot | null) => void;
  onScoreChange: (runId: string, criterionId: string, score: number) => void;
  onCreateRubric: () => void;
  onEditRubric: (rubric: EvaluationRubricRecord) => void;
}) {
  const currentDefinition = rubric
    ? (rubrics.find((value) => value.id === rubric.id) ?? null)
    : null;
  const usingCurrentDefinition = Boolean(
    currentDefinition && rubric?.revision === currentDefinition.revision
  );
  const savedDefinition = savedRubric
    ? rubrics.find(
        (definition) =>
          definition.id === savedRubric.id &&
          definition.revision === savedRubric.revision
      )
    : null;
  const showSavedRubric = Boolean(savedRubric && !savedDefinition);
  const selectValue = !rubric
    ? NO_RUBRIC
    : usingCurrentDefinition
      ? `${DEFINITION_PREFIX}${rubric.id}`
      : SAVED_RUBRIC;
  const completeScores = useMemo(
    () =>
      rubric
        ? completeRunScores(rubric, scoreDraft, [leftRunId, rightRunId])
        : null,
    [leftRunId, rightRunId, rubric, scoreDraft]
  );
  const leftAverage = averageScoreForRun(
    rubric ?? undefined,
    completeScores ?? undefined,
    leftRunId
  );
  const rightAverage = averageScoreForRun(
    rubric ?? undefined,
    completeScores ?? undefined,
    rightRunId
  );
  const delta =
    leftAverage === null || rightAverage === null
      ? null
      : rightAverage - leftAverage;
  const missingCount = rubric
    ? rubric.criteria.reduce((count, criterion) => {
        return (
          count +
          (scoreDraft[leftRunId]?.[criterion.id] ? 0 : 1) +
          (scoreDraft[rightRunId]?.[criterion.id] ? 0 : 1)
        );
      }, 0)
    : 0;

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium">Rubric</div>
          <div className="text-muted-foreground text-[0.625rem]">
            Score each run consistently, or keep the legacy verdict-only flow.
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Select
            value={selectValue}
            onValueChange={(value) => {
              if (value === NO_RUBRIC) {
                onRubricChange(null);
                return;
              }
              if (value === SAVED_RUBRIC) {
                onRubricChange(savedRubric);
                return;
              }
              const id = value.slice(DEFINITION_PREFIX.length);
              const definition = rubrics.find((item) => item.id === id);
              onRubricChange(
                definition ? snapshotEvaluationRubric(definition) : null
              );
            }}
          >
            <SelectTrigger className="w-52" aria-label="Evaluation rubric">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_RUBRIC}>No rubric</SelectItem>
              {showSavedRubric && savedRubric && (
                <SelectItem value={SAVED_RUBRIC}>
                  {savedRubric.name} (saved v{savedRubric.revision})
                </SelectItem>
              )}
              {rubrics
                .slice()
                .reverse()
                .map((definition) => (
                  <SelectItem
                    key={definition.id}
                    value={`${DEFINITION_PREFIX}${definition.id}`}
                  >
                    {definition.name} · v{definition.revision}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {currentDefinition && !usingCurrentDefinition && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                onRubricChange(snapshotEvaluationRubric(currentDefinition))
              }
            >
              Use current v{currentDefinition.revision}
            </Button>
          )}
          {currentDefinition && (
            <Tooltip content="Edit rubric">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Edit rubric ${currentDefinition.name}`}
                onClick={() => onEditRubric(currentDefinition)}
              >
                <Edit3Icon className="size-3" />
              </Button>
            </Tooltip>
          )}
          <Tooltip
            content={
              rubrics.length >= MAX_EVALUATION_RUBRICS
                ? `Maximum ${MAX_EVALUATION_RUBRICS} rubrics per thread`
                : "Create rubric"
            }
          >
            <span
              className="inline-flex"
              tabIndex={
                rubrics.length >= MAX_EVALUATION_RUBRICS ? 0 : undefined
              }
              aria-label={
                rubrics.length >= MAX_EVALUATION_RUBRICS
                  ? `Maximum ${MAX_EVALUATION_RUBRICS} rubrics per thread`
                  : undefined
              }
            >
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Create rubric"
                disabled={rubrics.length >= MAX_EVALUATION_RUBRICS}
                onClick={onCreateRubric}
              >
                <PlusIcon className="size-3" />
              </Button>
            </span>
          </Tooltip>
        </div>
      </div>

      {rubric && (
        <>
          <div className="bg-muted/20 hidden grid-cols-[minmax(12rem,1fr)_minmax(13rem,auto)_minmax(13rem,auto)] items-center gap-3 rounded-md px-3 py-2 text-[0.625rem] font-medium md:grid">
            <span>Criterion</span>
            <span className="text-center">Run A</span>
            <span className="text-center">Run B</span>
          </div>
          <div className="flex flex-col gap-2">
            {rubric.criteria.map((criterion) => (
              <div
                key={criterion.id}
                className="bg-muted/10 grid gap-3 rounded-md border px-3 py-2 md:grid-cols-[minmax(12rem,1fr)_minmax(13rem,auto)_minmax(13rem,auto)] md:items-center"
              >
                <div className="min-w-0">
                  <div className="text-xs font-medium break-words">
                    {criterion.name}
                  </div>
                  {criterion.description && (
                    <div className="text-muted-foreground mt-0.5 text-[0.625rem] break-words">
                      {criterion.description}
                    </div>
                  )}
                </div>
                <_ScoreButtons
                  label="Run A"
                  criterionName={criterion.name}
                  value={scoreDraft[leftRunId]?.[criterion.id]}
                  onChange={(score) =>
                    onScoreChange(leftRunId, criterion.id, score)
                  }
                />
                <_ScoreButtons
                  label="Run B"
                  criterionName={criterion.name}
                  value={scoreDraft[rightRunId]?.[criterion.id]}
                  onChange={(score) =>
                    onScoreChange(rightRunId, criterion.id, score)
                  }
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
            <span className="text-muted-foreground">
              1 = poor · 5 = excellent
            </span>
            {delta === null ? (
              <span className="text-muted-foreground">
                {missingCount} score{missingCount === 1 ? "" : "s"} remaining
              </span>
            ) : (
              <span className="font-mono tabular-nums">
                A {leftAverage!.toFixed(1)} · B {rightAverage!.toFixed(1)} · B −
                A {delta >= 0 ? "+" : ""}
                {delta.toFixed(1)}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function _ScoreButtons({
  label,
  criterionName,
  value,
  onChange,
}: {
  label: string;
  criterionName: string;
  value: number | undefined;
  onChange: (score: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground text-[0.625rem]">{label}</span>
      <ButtonGroup role="radiogroup" aria-label={`${label}, ${criterionName}`}>
        {[1, 2, 3, 4, 5].map((score) => (
          <Button
            key={score}
            type="button"
            size="icon-sm"
            variant={value === score ? "default" : "outline"}
            role="radio"
            aria-label={`${label}, ${criterionName}, score ${score} of 5`}
            aria-checked={value === score}
            data-score={score}
            tabIndex={
              value === score || (value === undefined && score === 1) ? 0 : -1
            }
            onClick={() => onChange(score)}
            onKeyDown={(event) => _handleScoreKeyDown(event, score, onChange)}
          >
            {score}
          </Button>
        ))}
      </ButtonGroup>
    </div>
  );
}

function _handleScoreKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  current: number,
  onChange: (score: number) => void
) {
  let next: number | null = null;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    next = current === 5 ? 1 : current + 1;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    next = current === 1 ? 5 : current - 1;
  } else if (event.key === "Home") {
    next = 1;
  } else if (event.key === "End") {
    next = 5;
  }
  if (next === null) {
    return;
  }
  event.preventDefault();
  onChange(next);
  event.currentTarget.parentElement
    ?.querySelector<HTMLElement>(`[data-score="${next}"]`)
    ?.focus();
}
