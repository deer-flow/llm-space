import { describe, expect, test } from "bun:test";

import type { ModelUsage, Thread } from "@llm-space/core";
import {
  aggregateMessageUsage,
  hasThreadPromptVariableReference,
  normalizePromptVariableState,
  recordRun,
  renderThreadPromptVariables,
  snapshotEvaluationRubric,
  upsertEvaluation,
  upsertEvaluationRubric,
  withPromptVariableSnapshot,
} from "@llm-space/core/thread";

const USAGE: ModelUsage = {
  input: 10,
  output: 5,
  cacheRead: 2,
  cacheWrite: 0,
  totalTokens: 17,
  cost: {
    input: 0.01,
    output: 0.02,
    cacheRead: 0.001,
    cacheWrite: 0,
    total: 0.031,
  },
};

describe("public headless thread workflow", () => {
  test("materializes, records, and evaluates without desktop imports", async () => {
    const template: Thread = {
      title: "Headless workflow",
      context: {
        systemPrompt: "Today: {{current_date}}\n{{available_skills}}",
        variables: {
          current_date: { type: "currentDate", format: "iso-date" },
          available_skills: {
            type: "skills",
            skillNames: ["deep-research"],
            format: "markdown-list",
            indent: 0,
          },
        },
        variableVariants: {
          active: "default",
          variants: { default: { customer: "Acme" } },
        },
        messages: [
          {
            id: "user-1",
            role: "user",
            content: [{ type: "text", text: "Research {{customer}}" }],
          },
        ],
      },
    };

    const rendered = await renderThreadPromptVariables({
      context: template.context!,
      now: () => new Date(2026, 6, 12, 9, 30),
      loadSkills: () =>
        Promise.resolve([
          {
            name: "deep-research",
            description: "Research deeply",
            path: "/skills/deep-research",
          },
        ]),
    });

    expect(rendered.context.systemPrompt).toBe(
      "Today: 2026-07-12\n- **deep-research**: Research deeply"
    );
    expect(rendered.context.messages?.[0]?.content[0]).toEqual({
      type: "text",
      text: "Research Acme",
    });
    expect(rendered.snapshot?.variables).toEqual({
      systemPrompt: {
        current_date: "2026-07-12",
        available_skills: "- **deep-research**: Research deeply",
      },
      "message:user-1:text": { customer: "Acme" },
    });

    const completedThread = withPromptVariableSnapshot(
      {
        ...template,
        context: {
          ...template.context,
          messages: [
            ...(template.context?.messages ?? []),
            {
              id: "assistant-1",
              role: "assistant",
              content: [{ type: "text", text: "Result A" }],
              usage: USAGE,
            },
          ],
        },
      },
      rendered.snapshot
    );
    const usage = aggregateMessageUsage(
      completedThread.context?.messages ?? []
    );
    expect(usage).toEqual(USAGE);

    const firstRun = recordRun([], completedThread, 1000, {
      id: "run-a",
      usage,
    });
    const runs = recordRun(firstRun, completedThread, 2000, {
      id: "run-b",
      usage,
    });
    const rubricResult = upsertEvaluationRubric(
      [],
      {
        name: "Quality",
        criteria: [
          { id: "accuracy", name: "Accuracy" },
          { id: "clarity", name: "Clarity" },
        ],
      },
      3000,
      { id: "rubric-1" }
    );
    expect(rubricResult).not.toBeNull();
    const rubric = snapshotEvaluationRubric(rubricResult!.rubric);
    const evaluations = upsertEvaluation(
      [],
      runs,
      {
        id: "evaluation-1",
        leftRunId: "run-a",
        rightRunId: "run-b",
        verdict: "rightBetter",
        rubric,
        runScores: [
          {
            runId: "run-a",
            scores: [
              { criterionId: "accuracy", score: 3 },
              { criterionId: "clarity", score: 4 },
            ],
          },
          {
            runId: "run-b",
            scores: [
              { criterionId: "accuracy", score: 5 },
              { criterionId: "clarity", score: 5 },
            ],
          },
        ],
      },
      4000
    );

    expect(evaluations).toHaveLength(1);
    expect(evaluations?.[0]).toMatchObject({
      id: "evaluation-1",
      leftRunId: "run-a",
      rightRunId: "run-b",
      verdict: "rightBetter",
      rubric: { id: "rubric-1", revision: 1 },
    });
    expect(runs[0]?.thread.context?.systemPrompt).toBe(
      "Today: {{current_date}}\n{{available_skills}}"
    );
    expect(runs[0]?.thread.context?.snapshot).toEqual(rendered.snapshot);
  });

  test("keeps frozen prompt bytes across later runs", async () => {
    const context: NonNullable<Thread["context"]> = {
      systemPrompt: "Date: {{current_date}}",
      variables: {
        current_date: { type: "currentDate", format: "iso-date" },
      },
    };
    const first = await renderThreadPromptVariables({
      context,
      now: () => new Date(2026, 6, 12, 9, 30),
    });
    const second = await renderThreadPromptVariables({
      context: { ...context, snapshot: first.snapshot },
      now: () => new Date(2027, 0, 1, 9, 30),
    });

    expect(first.context.systemPrompt).toBe("Date: 2026-07-12");
    expect(second.context.systemPrompt).toBe("Date: 2026-07-12");
  });

  test("normalizes legacy variable configuration", () => {
    const state = normalizePromptVariableState({
      variables: {
        date: { type: "currentDate", format: "legacy" },
        skills: {
          type: "skills",
          skillNames: ["one", 2, "two"],
          format: "legacy",
          indent: 3,
        },
      },
      variableVariants: {
        active: "scenario",
        variants: { scenario: { customer: "Acme", invalid: 42 } },
      },
    } as unknown as NonNullable<Thread["context"]>);

    expect(state).toEqual({
      variables: {
        date: { type: "currentDate", format: "readable-date" },
        skills: {
          type: "skills",
          skillNames: ["one", "two"],
          format: "xml",
          indent: 0,
        },
      },
      variableVariants: {
        active: "default",
        variants: { default: { customer: "Acme" } },
      },
    });
  });

  test("captures independent values for every prompt place", async () => {
    const rendered = await renderThreadPromptVariables({
      context: {
        systemPrompt: "System {{value}}",
        variableVariants: {
          active: "default",
          variants: { default: { value: "frozen" } },
        },
        messages: [
          {
            id: "user-1",
            role: "user",
            content: [{ type: "text", text: "User {{value}}" }],
          },
          {
            id: "assistant-1",
            role: "assistant",
            content: [],
            toolCalls: [
              {
                id: "tool-1",
                input: { name: "lookup", arguments: {} },
                output: {
                  content: [{ type: "text", text: "Tool {{value}}" }],
                },
              },
            ],
          },
        ],
      },
    });

    expect(rendered.snapshot?.variables).toEqual({
      systemPrompt: { value: "frozen" },
      "message:user-1:text": { value: "frozen" },
      "toolResult:assistant-1:tool-1:text": { value: "frozen" },
    });
  });

  test("detects references across every model-facing text surface", () => {
    const contexts: NonNullable<Thread["context"]>[] = [
      { systemPrompt: "System {{customer}}" },
      {
        messages: [
          {
            id: "user-1",
            role: "user",
            content: [{ type: "text", text: "User {{ customer }}" }],
          },
        ],
      },
      {
        messages: [
          {
            id: "assistant-1",
            role: "assistant",
            content: [],
            toolCalls: [
              {
                id: "tool-1",
                input: { name: "lookup", arguments: {} },
                output: {
                  content: [{ type: "text", text: "Tool {{customer}}" }],
                },
              },
            ],
          },
        ],
      },
      {
        systemPrompt: "System {{other}}",
        messages: [
          {
            id: "user-2",
            role: "user",
            content: [{ type: "text", text: "User {{other}}" }],
          },
        ],
      },
    ];

    expect(
      contexts.map((context) =>
        hasThreadPromptVariableReference(context, "customer")
      )
    ).toEqual([true, true, true, false]);
  });

  test("preserves the missing-skill error contract", async () => {
    const render = renderThreadPromptVariables({
      context: {
        systemPrompt: "{{available_skills}}",
        variables: {
          available_skills: {
            type: "skills",
            skillNames: ["missing-skill"],
            format: "xml",
            indent: 0,
          },
        },
      },
      loadSkills: () => Promise.resolve([]),
    });

    const error = await render.then(
      () => null,
      (reason: unknown) => reason
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'Skill "missing-skill" in variable "available_skills" is not enabled or cannot be found.'
    );
  });
});
