import type {
  EvaluationRecord,
  EvaluationRubricRecord,
  EvaluationRubricSnapshot,
} from "@llm-space/core/thread";
import { describe, expect, test } from "bun:test";

import {
  averageScoreForRun,
  completeRunScores,
  evaluationScoreDelta,
  findEvaluationForPair,
  initialRubricForEvaluation,
  preferredEvaluationRubricId,
  requiresScoreRemovalConfirmation,
  scoreDraftForRubricChange,
} from "./run-evaluation-utils";
const RUBRIC: EvaluationRubricSnapshot = {
  id: "rubric-1",
  name: "Answer quality",
  revision: 1,
  criteria: [
    { id: "correctness", name: "Correctness" },
    { id: "clarity", name: "Clarity" },
  ],
};

const EVALUATION: EvaluationRecord = {
  id: "evaluation-1",
  leftRunId: "run-a",
  rightRunId: "run-b",
  verdict: "leftBetter",
  rubric: RUBRIC,
  runScores: [
    {
      runId: "run-a",
      scores: [
        { criterionId: "correctness", score: 5 },
        { criterionId: "clarity", score: 3 },
      ],
    },
    {
      runId: "run-b",
      scores: [
        { criterionId: "correctness", score: 3 },
        { criterionId: "clarity", score: 3 },
      ],
    },
  ],
  createdAt: 1,
  updatedAt: 1,
};

const RUBRIC_RECORD: EvaluationRubricRecord = {
  ...RUBRIC,
  createdAt: 1,
  updatedAt: 1,
};

describe("evaluation orientation", () => {
  test("flips only the directional verdict and leaves run-keyed scores intact", () => {
    const reversed = findEvaluationForPair([EVALUATION], "run-b", "run-a");
    expect(reversed).toMatchObject({
      leftRunId: "run-b",
      rightRunId: "run-a",
      verdict: "rightBetter",
    });
    expect(reversed?.runScores).toBe(EVALUATION.runScores);
  });

  test("keeps invariant verdicts unchanged", () => {
    for (const verdict of ["tie", "pass", "fail"] as const) {
      const reversed = findEvaluationForPair(
        [{ ...EVALUATION, verdict }],
        "run-b",
        "run-a"
      );
      expect(reversed?.verdict).toBe(verdict);
    }
  });
});

describe("evaluation rubric selection", () => {
  test("keeps legacy saved evaluations rubric-free", () => {
    const legacy: EvaluationRecord = {
      id: "legacy-evaluation",
      leftRunId: "run-a",
      rightRunId: "run-b",
      verdict: "tie",
      createdAt: 1,
      updatedAt: 1,
    };
    expect(initialRubricForEvaluation(legacy, RUBRIC)).toBeNull();
    expect(initialRubricForEvaluation(null, RUBRIC)).toBe(RUBRIC);
  });

  test("chooses the available rubric from the most recently updated evaluation", () => {
    const other: EvaluationRubricRecord = {
      ...RUBRIC_RECORD,
      id: "rubric-2",
      name: "Other rubric",
    };
    expect(
      preferredEvaluationRubricId(
        [
          { ...EVALUATION, updatedAt: 30 },
          {
            ...EVALUATION,
            id: "evaluation-2",
            rubric: other,
            updatedAt: 20,
          },
        ],
        [RUBRIC_RECORD, other]
      )
    ).toBe(RUBRIC.id);
  });

  test("confirms only when removing scores from a structured evaluation", () => {
    expect(requiresScoreRemovalConfirmation(EVALUATION, null)).toBe(true);
    expect(requiresScoreRemovalConfirmation(EVALUATION, RUBRIC)).toBe(false);
    expect(requiresScoreRemovalConfirmation(null, null)).toBe(false);
  });
});

describe("evaluation score derivation", () => {
  test("builds complete scores and derives averages and B-minus-A", () => {
    const scores = completeRunScores(
      RUBRIC,
      {
        "run-a": { correctness: 5, clarity: 3 },
        "run-b": { correctness: 3, clarity: 3 },
      },
      ["run-a", "run-b"]
    );
    expect(averageScoreForRun(RUBRIC, scores ?? undefined, "run-a")).toBe(4);
    expect(averageScoreForRun(RUBRIC, scores ?? undefined, "run-b")).toBe(3);
    if (!scores) throw new Error("score fixture failed");
    expect(evaluationScoreDelta({ ...EVALUATION, runScores: scores })).toBe(-1);
  });

  test("returns incomplete until every run and criterion has a score", () => {
    expect(
      completeRunScores(
        RUBRIC,
        {
          "run-a": { correctness: 5, clarity: 3 },
          "run-b": { correctness: 3 },
        },
        ["run-a", "run-b"]
      )
    ).toBeNull();
  });

  test("reconciles a new revision by stable criterion ID", () => {
    const nextRubric: EvaluationRubricSnapshot = {
      ...RUBRIC,
      revision: 2,
      criteria: [
        { id: "correctness", name: "Factual correctness" },
        { id: "completeness", name: "Completeness" },
      ],
    };
    expect(
      scoreDraftForRubricChange(
        {
          "run-a": { correctness: 5, clarity: 3 },
          "run-b": { correctness: 3, clarity: 3 },
        },
        RUBRIC,
        nextRubric,
        ["run-a", "run-b"]
      )
    ).toEqual({
      "run-a": { correctness: 5 },
      "run-b": { correctness: 3 },
    });
  });

  test("does not carry scores across unrelated rubrics with reused criterion IDs", () => {
    expect(
      scoreDraftForRubricChange(
        {
          "run-a": { correctness: 5 },
          "run-b": { correctness: 3 },
        },
        RUBRIC,
        { ...RUBRIC, id: "rubric-2", name: "Different meaning" },
        ["run-a", "run-b"]
      )
    ).toEqual({});
  });

  test("restores scores when returning to the saved rubric snapshot", () => {
    expect(
      scoreDraftForRubricChange(
        {},
        null,
        RUBRIC,
        ["run-a", "run-b"],
        EVALUATION
      )
    ).toEqual({
      "run-a": { correctness: 5, clarity: 3 },
      "run-b": { correctness: 3, clarity: 3 },
    });
  });

  test("preserves draft scores when the rubric revision is unchanged", () => {
    expect(
      scoreDraftForRubricChange(
        {
          "run-a": { correctness: 4, clarity: 3 },
          "run-b": { correctness: 3, clarity: 3 },
        },
        RUBRIC,
        RUBRIC,
        ["run-a", "run-b"],
        EVALUATION
      )
    ).toEqual({
      "run-a": { correctness: 4, clarity: 3 },
      "run-b": { correctness: 3, clarity: 3 },
    });
  });
});
