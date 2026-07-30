import { describe, expect, test } from "bun:test";

import type { ToolCallInput } from "@llm-space/core";

import { parseTodoWriteInput } from "../../../../src/components/thread-playground/message/todo-write-input";

function _createInput(
  name: string,
  argumentsValue: Record<string, unknown>,
  partialArguments?: string
): ToolCallInput {
  return {
    name,
    arguments: argumentsValue,
    partialArguments,
  };
}

describe("parseTodoWriteInput", () => {
  test("preserves every supported todo status", () => {
    const todos = [
      { content: "Pending", status: "pending" },
      { content: "Active", status: "in_progress" },
      { content: "Done", status: "completed" },
      { content: "Stopped", status: "cancelled" },
    ] satisfies NonNullable<ReturnType<typeof parseTodoWriteInput>>;
    const input = _createInput("todo_write", { todos });

    expect(parseTodoWriteInput(input, false)).toEqual(todos);
  });

  test("keeps only semantically complete todos while streaming", () => {
    const input = _createInput("todo_write", {
      todos: [
        { content: "Ready", status: "pending" },
        { content: "Missing status" },
        { status: "cancelled" },
        null,
      ],
    });

    expect(parseTodoWriteInput(input, true)).toEqual([
      { content: "Ready", status: "pending" },
    ]);
  });

  test("does not specialize non-todo tool calls", () => {
    const input = _createInput("other_tool", { todos: [] });

    expect(parseTodoWriteInput(input, true)).toBeNull();
  });

  test("does not treat partialArguments as streaming state", () => {
    const input = _createInput(
      "todo_write",
      { todos: [{ content: "Interrupted" }] },
      '{"todos":[{"content":"Interrupted"'
    );

    expect(parseTodoWriteInput(input, false)).toBeNull();
    expect(parseTodoWriteInput(input, true)).toEqual([]);
  });

  test("falls back for persisted malformed input", () => {
    const input = _createInput("todo_write", {
      todos: [
        { content: "Complete", status: "completed" },
        { content: "Interrupted" },
      ],
    });

    expect(parseTodoWriteInput(input, false)).toBeNull();
  });
});
