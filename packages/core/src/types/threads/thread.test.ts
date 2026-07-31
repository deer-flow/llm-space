import { describe, expect, test } from "bun:test";

import { Compile } from "typebox/compile";

import { Thread } from "./thread";

const validator = Compile(Thread);

const LEGACY_THREAD = {
  title: "Legacy comparison",
  runHistory: [
    { id: "run-a", thread: {}, timestamp: 1 },
    { id: "run-b", thread: {}, timestamp: 2 },
  ],
  evaluations: [
    {
      id: "evaluation-1",
      leftRunId: "run-a",
      rightRunId: "run-b",
      verdict: "rightBetter",
      note: "Better answer",
      createdAt: 3,
      updatedAt: 3,
    },
  ],
} as const;

describe("Thread evaluation schema", () => {
  test("keeps legacy verdict-only evaluations valid", () => {
    expect(validator.Check(LEGACY_THREAD)).toBe(true);
  });

  test("accepts reusable rubrics and immutable score snapshots", () => {
    const criterion = { id: "criterion-1", name: "Correctness" };
    expect(
      validator.Check({
        ...LEGACY_THREAD,
        evaluationRubrics: [
          {
            id: "rubric-1",
            name: "Answer quality",
            criteria: [criterion, { id: "criterion-2", name: "Clarity" }],
            revision: 1,
            createdAt: 4,
            updatedAt: 4,
          },
        ],
        evaluations: [
          {
            ...LEGACY_THREAD.evaluations[0],
            rubric: {
              id: "rubric-1",
              name: "Answer quality",
              criteria: [criterion, { id: "criterion-2", name: "Clarity" }],
              revision: 1,
            },
            runScores: [
              {
                runId: "run-a",
                scores: [
                  { criterionId: "criterion-1", score: 3 },
                  { criterionId: "criterion-2", score: 4 },
                ],
              },
              {
                runId: "run-b",
                scores: [
                  { criterionId: "criterion-1", score: 5 },
                  { criterionId: "criterion-2", score: 4 },
                ],
              },
            ],
          },
        ],
      })
    ).toBe(true);
  });

  test("rejects scores outside the fixed integer 1-5 scale", () => {
    const structured = {
      ...LEGACY_THREAD,
      evaluations: [
        {
          ...LEGACY_THREAD.evaluations[0],
          rubric: {
            id: "rubric-1",
            name: "Answer quality",
            criteria: [
              { id: "criterion-1", name: "Correctness" },
              { id: "criterion-2", name: "Clarity" },
            ],
            revision: 1,
          },
          runScores: [
            {
              runId: "run-a",
              scores: [
                { criterionId: "criterion-1", score: 0 },
                { criterionId: "criterion-2", score: 4 },
              ],
            },
            {
              runId: "run-b",
              scores: [
                { criterionId: "criterion-1", score: 5 },
                { criterionId: "criterion-2", score: 4.5 },
              ],
            },
          ],
        },
      ],
    };
    expect(validator.Check(structured)).toBe(false);
  });

  test("requires bounded criteria and paired structured score data", () => {
    const rubric = {
      id: "rubric-1",
      name: "Answer quality",
      criteria: [
        { id: "criterion-1", name: "Correctness" },
        { id: "criterion-2", name: "Clarity" },
      ],
      revision: 1,
    };
    const runScores = [
      {
        runId: "run-a",
        scores: [
          { criterionId: "criterion-1", score: 3 },
          { criterionId: "criterion-2", score: 4 },
        ],
      },
      {
        runId: "run-b",
        scores: [
          { criterionId: "criterion-1", score: 5 },
          { criterionId: "criterion-2", score: 4 },
        ],
      },
    ];
    const base = LEGACY_THREAD.evaluations[0];

    expect(
      validator.Check({
        ...LEGACY_THREAD,
        evaluations: [{ ...base, rubric }],
      })
    ).toBe(false);
    expect(
      validator.Check({
        ...LEGACY_THREAD,
        evaluations: [{ ...base, runScores }],
      })
    ).toBe(false);
    expect(
      validator.Check({
        ...LEGACY_THREAD,
        evaluations: [{ ...base, rubric, runScores: runScores.slice(0, 1) }],
      })
    ).toBe(false);
    expect(
      validator.Check({
        ...LEGACY_THREAD,
        evaluations: [
          { ...base, rubric: { ...rubric, criteria: [] }, runScores },
        ],
      })
    ).toBe(false);
  });
});

describe("Thread assistant message timing schema", () => {
  test("accepts legacy assistant messages without timing", () => {
    expect(
      validator.Check({
        context: {
          messages: [
            {
              id: "assistant-legacy",
              role: "assistant",
              content: [{ type: "text", text: "Legacy response" }],
            },
          ],
        },
      })
    ).toBe(true);
  });

  test("accepts persisted first-token and duration timing", () => {
    expect(
      validator.Check({
        context: {
          messages: [
            {
              id: "assistant-1",
              role: "assistant",
              content: [{ type: "text", text: "Hello" }],
              timing: {
                firstTokenMs: 125.5,
                durationMs: 840,
              },
            },
          ],
        },
      })
    ).toBe(true);
  });

  test("keeps first-token timing optional and rejects negative durations", () => {
    const message = {
      id: "assistant-1",
      role: "assistant",
      content: [{ type: "text", text: "" }],
    };
    expect(
      validator.Check({
        context: {
          messages: [{ ...message, timing: { durationMs: 840 } }],
        },
      })
    ).toBe(true);
    expect(
      validator.Check({
        context: {
          messages: [
            {
              ...message,
              timing: { firstTokenMs: 125, durationMs: -1 },
            },
          ],
        },
      })
    ).toBe(false);
  });
});

describe("Thread image content schema", () => {
  test("accepts only pi-compatible image content", () => {
    expect(
      validator.Check({
        context: {
          messages: [
            {
              id: "user-1",
              role: "user",
              content: [
                {
                  type: "image",
                  data: "c3Zn",
                  mimeType: "image/svg+xml",
                },
              ],
            },
          ],
        },
      })
    ).toBe(true);
    expect(
      validator.Check({
        context: {
          messages: [
            {
              id: "user-1",
              role: "user",
              content: [
                {
                  type: "image_data",
                  data: "cG5n",
                  mimeType: "image/png",
                },
              ],
            },
          ],
        },
      })
    ).toBe(false);
  });
});
