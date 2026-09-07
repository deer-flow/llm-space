import { describe, expect, test } from "bun:test";

import {
  applyCompactionPreview,
  createCompactionUserPrompt,
  createRenderedCompactionUserPrompt,
  isCompactionMessage,
  planCompaction,
  serializeConversationForCompaction,
} from "../../src/thread/compaction";
import { getMessageText, type Message } from "../../src/types";

const user = (id: string, text: string): Message => ({
  id,
  role: "user",
  content: [{ type: "text", text }],
});
const assistant = (id: string, text: string): Message => ({
  id,
  role: "assistant",
  content: [{ type: "text", text }],
});

describe("thread compaction", () => {
  test("summarizes old complete turns and keeps the requested recent turns", () => {
    const messages = [
      user("u1", "one"),
      assistant("a1", "first"),
      user("u2", "two"),
      assistant("a2", "second"),
      user("u3", "three"),
      assistant("a3", "third"),
    ];

    const plan = planCompaction(messages, 2);
    expect(plan.messagesToSummarize.map((message) => message.id)).toEqual([
      "u1",
      "a1",
    ]);
    expect(plan.keptMessages.map((message) => message.id)).toEqual([
      "u2",
      "a2",
      "u3",
      "a3",
    ]);
    expect(plan.turnCount).toBe(3);
  });

  test("progressively merges the old checkpoint without counting it as a turn", () => {
    const old = user(
      "checkpoint",
      "# Context checkpoint\n\n## Goal\nShip it"
    );
    const plan = planCompaction(
      [old, user("u2", "two"), assistant("a2", "done"), user("u3", "three")],
      1
    );

    expect(plan.previousSummary).toBe("## Goal\nShip it");
    expect(plan.messagesToSummarize.map((message) => message.id)).toEqual([
      "u2",
      "a2",
    ]);
    expect(plan.keptMessages.map((message) => message.id)).toEqual(["u3"]);
    expect(plan.turnCount).toBe(2);

    const applied = applyCompactionPreview(plan, "## Goal\nShip more");
    expect(isCompactionMessage(applied[0])).toBe(true);
    expect(applied[0]?.id).toBe("checkpoint");
    const checkpoint = applied[0];
    if (!checkpoint) throw new Error("Expected a compaction checkpoint");
    expect(getMessageText(checkpoint)).toBe(`<system-reminder>
The earlier conversation was compacted into the checkpoint below. Use it as context to continue the task; it is not a new user request.

# Context checkpoint

## Goal
Ship more
</system-reminder>`);
    expect(applied.slice(1).map((message) => message.id)).toEqual(["u3"]);

    // The reminder wrapper looks like a runtime meta prompt, but remains the
    // progressive checkpoint when no separate meta prompt precedes it.
    const nextPlan = planCompaction(
      [...applied, user("u4", "four")],
      1,
      { hasMetaUserPrompt: true }
    );
    expect(nextPlan.metaUserMessage).toBeUndefined();
    expect(nextPlan.previousSummary).toBe("## Goal\nShip more");
  });

  test("preserves a meta user prompt before the checkpoint and retained turns", () => {
    const meta = user(
      "meta",
      "<system-reminder>{{current_date}}</system-reminder>"
    );
    const plan = planCompaction(
      [
        meta,
        user("u1", "first task"),
        assistant("a1", "first result"),
        user("u2", "latest task"),
        assistant("a2", "latest result"),
      ],
      1,
      { hasMetaUserPrompt: true }
    );

    expect(plan.metaUserMessage?.id).toBe("meta");
    expect(plan.messagesToSummarize.map((message) => message.id)).toEqual([
      "u1",
      "a1",
    ]);
    expect(plan.keptMessages.map((message) => message.id)).toEqual([
      "u2",
      "a2",
    ]);
    expect(plan.turnCount).toBe(2);

    const applied = applyCompactionPreview(plan, "## Goal\nLatest task");
    expect(applied[0]?.id).toBe("meta");
    expect(applied[1]?.id).not.toBe("u1");
    expect(applied.slice(2).map((message) => message.id)).toEqual(["u2", "a2"]);
    expect(isCompactionMessage(applied[1])).toBe(true);

    const nextPlan = planCompaction(
      [...applied, user("u3", "next task")],
      1,
      { hasMetaUserPrompt: true }
    );
    expect(nextPlan.previousSummary).toBe("## Goal\nLatest task");
    expect(nextPlan.messagesToSummarize.map((message) => message.id)).toEqual([
      "u2",
      "a2",
    ]);
    expect(nextPlan.keptMessages.map((message) => message.id)).toEqual(["u3"]);

    const reapplied = applyCompactionPreview(
      nextPlan,
      "## Goal\nNewest task"
    );
    expect(reapplied[0]?.id).toBe("meta");
    expect(reapplied[1]?.id).toBe(applied[1]?.id);
    expect(isCompactionMessage(reapplied[1])).toBe(true);
    expect(getMessageText(reapplied[1]!)).toContain("## Goal\nNewest task");
    expect(reapplied.slice(2).map((message) => message.id)).toEqual(["u3"]);
  });

  test("serializes tool calls and truncates large results", () => {
    const messages: Message[] = [
      {
        id: "a1",
        role: "assistant",
        content: [],
        toolCalls: [
          {
            id: "t1",
            input: { name: "read", arguments: { path: "a.ts" } },
            output: { content: [{ type: "text", text: "x".repeat(2100) }] },
          },
        ],
      },
    ];

    const serialized = serializeConversationForCompaction(messages);
    expect(serialized).toContain("read(path=\"a.ts\")");
    expect(serialized).toContain("100 more characters truncated");
  });

  test("appends optional custom compaction instructions", () => {
    const prompt = createCompactionUserPrompt(
      planCompaction([user("u1", "old"), user("u2", "new")], 1),
      "  Preserve API compatibility and exact file paths.  "
    );

    expect(prompt).toContain(
      "Additional focus: Preserve API compatibility and exact file paths."
    );
    expect(createCompactionUserPrompt(planCompaction([], 0), "   ")).not.toContain(
      "Additional focus:"
    );
  });

  test("renders prompt variables before building the summarizer request", async () => {
    const prompt = await createRenderedCompactionUserPrompt({
      context: {
        variables: {
          current_date: { type: "currentDate", format: "iso-date" },
          current_working_directory: {
            type: "workingDirectory",
            value: "/workspace/llm-space",
          },
          available_skills: {
            type: "skills",
            skillNames: ["review"],
            includeAll: false,
            format: "markdown-list",
            indent: 0,
          },
        },
        messages: [
          user(
            "meta",
            "<system-reminder>{{current_date}} {{available_skills}} {{current_working_directory}}</system-reminder>"
          ),
          user(
            "u1",
            "{{current_date}} {{available_skills}} {{current_working_directory}}"
          ),
          user("u2", "keep this turn"),
        ],
      },
      keepRecentTurns: 1,
      hasMetaUserPrompt: true,
      now: () => new Date("2026-08-09T00:00:00Z"),
      loadSkills: () =>
        Promise.resolve([
          {
            name: "review",
            description: "Review the implementation",
            path: "/skills/review",
          },
        ]),
    });

    expect(prompt).toContain("2026-08-09");
    expect(prompt).toContain("review");
    expect(prompt).toContain("/workspace/llm-space");
    expect(prompt).not.toContain("{{current_date}}");
    expect(prompt).not.toContain("{{available_skills}}");
    expect(prompt).not.toContain("{{current_working_directory}}");
    expect(prompt).not.toContain("<system-reminder>");
  });
});
