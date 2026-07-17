import type {
  EvaluationRecord,
  EvaluationRubricRecord,
  EvaluationRubricSnapshot,
  EvaluationRunScores,
} from "@llm-space/core/thread";

export type EvaluationScoreDraft = Record<string, Record<string, number>>;

/** Keep legacy saved evaluations rubric-free; only new comparisons get a default. */
export function initialRubricForEvaluation(
  evaluation: EvaluationRecord | null,
  preferredRubric: EvaluationRubricSnapshot | null
): EvaluationRubricSnapshot | null {
  return evaluation ? (evaluation.rubric ?? null) : preferredRubric;
}

/** Confirm before replacing persisted structured evidence with a legacy record. */
export function requiresScoreRemovalConfirmation(
  evaluation: EvaluationRecord | null,
  nextRubric: EvaluationRubricSnapshot | null
): boolean {
  return Boolean(evaluation?.rubric && !nextRubric);
}

/** Most recently used available rubric, falling back to the newest definition. */
export function preferredEvaluationRubricId(
  evaluations: EvaluationRecord[],
  rubrics: EvaluationRubricRecord[]
): string | null {
  const availableIds = new Set(rubrics.map((rubric) => rubric.id));
  const latest = evaluations.reduce<EvaluationRecord | null>(
    (current, evaluation) => {
      if (
        !evaluation.rubric ||
        !availableIds.has(evaluation.rubric.id) ||
        (current && current.updatedAt >= evaluation.updatedAt)
      ) {
        return current;
      }
      return evaluation;
    },
    null
  );
  return latest?.rubric?.id ?? rubrics.at(-1)?.id ?? null;
}

/** Convert a persisted verdict into the currently displayed A/B orientation. */
export function flipEvaluationVerdict(
  verdict: EvaluationRecord["verdict"]
): EvaluationRecord["verdict"] {
  if (verdict === "leftBetter") {
    return "rightBetter";
  }
  if (verdict === "rightBetter") {
    return "leftBetter";
  }
  return verdict;
}

/** Treat a comparison as the same pair regardless of current A/B order. */
export function isSameRunPair(
  evaluation: EvaluationRecord,
  leftRunId: string,
  rightRunId: string
): boolean {
  return (
    (evaluation.leftRunId === leftRunId &&
      evaluation.rightRunId === rightRunId) ||
    (evaluation.leftRunId === rightRunId && evaluation.rightRunId === leftRunId)
  );
}

/** Find one saved evaluation and orient its directional verdict for the UI. */
export function findEvaluationForPair(
  evaluations: EvaluationRecord[],
  leftRunId: string,
  rightRunId: string
): EvaluationRecord | null {
  const evaluation = evaluations.find((value) =>
    isSameRunPair(value, leftRunId, rightRunId)
  );
  if (!evaluation) {
    return null;
  }
  if (
    evaluation.leftRunId === leftRunId &&
    evaluation.rightRunId === rightRunId
  ) {
    return evaluation;
  }
  return {
    ...evaluation,
    leftRunId,
    rightRunId,
    verdict: flipEvaluationVerdict(evaluation.verdict),
  };
}

/** Materialize a local score draft from a saved evaluation. */
export function scoreDraftFromEvaluation(
  evaluation: EvaluationRecord | null
): EvaluationScoreDraft {
  const draft: EvaluationScoreDraft = {};
  for (const runScores of evaluation?.runScores ?? []) {
    draft[runScores.runId] = Object.fromEntries(
      runScores.scores.map((score) => [score.criterionId, score.score])
    );
  }
  return draft;
}

/** Keep only scores valid for the selected runs and current rubric revision. */
export function reconcileScoreDraft(
  draft: EvaluationScoreDraft,
  rubric: EvaluationRubricSnapshot,
  runIds: string[]
): EvaluationScoreDraft {
  return Object.fromEntries(
    runIds.map((runId) => {
      const current = draft[runId] ?? {};
      return [
        runId,
        Object.fromEntries(
          rubric.criteria.flatMap((criterion) => {
            const score = current[criterion.id];
            return Number.isInteger(score) && score >= 1 && score <= 5
              ? [[criterion.id, score]]
              : [];
          })
        ),
      ];
    })
  );
}

/** Restore a saved snapshot or reconcile only revisions of the same rubric. */
export function scoreDraftForRubricChange(
  draft: EvaluationScoreDraft,
  previousRubric: EvaluationRubricSnapshot | null,
  nextRubric: EvaluationRubricSnapshot | null,
  runIds: string[],
  savedEvaluation?: EvaluationRecord | null
): EvaluationScoreDraft {
  if (
    nextRubric &&
    previousRubric?.id === nextRubric.id &&
    previousRubric.revision === nextRubric.revision
  ) {
    return reconcileScoreDraft(draft, nextRubric, runIds);
  }
  if (
    nextRubric &&
    savedEvaluation?.rubric?.id === nextRubric.id &&
    savedEvaluation.rubric.revision === nextRubric.revision
  ) {
    return reconcileScoreDraft(
      scoreDraftFromEvaluation(savedEvaluation),
      nextRubric,
      runIds
    );
  }
  if (!nextRubric || previousRubric?.id !== nextRubric.id) {
    return {};
  }
  return reconcileScoreDraft(draft, nextRubric, runIds);
}

/** Build the complete canonical persisted score payload, or null if incomplete. */
export function completeRunScores(
  rubric: EvaluationRubricSnapshot,
  draft: EvaluationScoreDraft,
  runIds: [string, string]
): EvaluationRunScores[] | null {
  const result = runIds.map((runId) => ({
    runId,
    scores: rubric.criteria.map((criterion) => ({
      criterionId: criterion.id,
      score: draft[runId]?.[criterion.id],
    })),
  }));
  if (
    result.some((run) =>
      run.scores.some(
        ({ score }) =>
          !Number.isInteger(score) ||
          score === undefined ||
          score < 1 ||
          score > 5
      )
    )
  ) {
    return null;
  }
  return result;
}

/** Mean score for one stable run ID, or null when no complete score exists. */
export function averageScoreForRun(
  rubric: EvaluationRubricSnapshot | undefined,
  runScores: EvaluationRunScores[] | undefined,
  runId: string
): number | null {
  if (!rubric || rubric.criteria.length === 0) {
    return null;
  }
  const scores = runScores?.find((value) => value.runId === runId)?.scores;
  if (scores?.length !== rubric.criteria.length) {
    return null;
  }
  const scoreByCriterion = new Map(
    scores.map((score) => [score.criterionId, score.score])
  );
  const values = rubric.criteria.map((criterion) =>
    scoreByCriterion.get(criterion.id)
  );
  let total = 0;
  for (const score of values) {
    if (score === undefined) {
      return null;
    }
    total += score;
  }
  return total / values.length;
}

/** Derived B-minus-A delta for a complete rubric-backed comparison. */
export function evaluationScoreDelta(
  evaluation: EvaluationRecord
): number | null {
  const left = averageScoreForRun(
    evaluation.rubric,
    evaluation.runScores,
    evaluation.leftRunId
  );
  const right = averageScoreForRun(
    evaluation.rubric,
    evaluation.runScores,
    evaluation.rightRunId
  );
  return left === null || right === null ? null : right - left;
}
