import type { ToolCallInput } from "@llm-space/core";

type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

export interface TodoItem {
  readonly content: string;
  readonly status: TodoStatus;
}

/**
 * Parse a todo_write input for its current rendering phase.
 *
 * Streaming input keeps the specialized view mounted and omits incomplete
 * items. Static malformed input returns null so callers can use the generic
 * tool input view.
 */
export function parseTodoWriteInput(
  input: ToolCallInput,
  streaming: boolean
): readonly TodoItem[] | null {
  if (input.name !== "todo_write") {
    return null;
  }
  const rawTodos = (input.arguments as Record<string, unknown>)?.todos;
  if (!Array.isArray(rawTodos)) {
    return streaming ? [] : null;
  }

  const todos: TodoItem[] = [];
  for (const rawTodo of rawTodos) {
    const todo = _parseTodo(rawTodo);
    if (todo === null) {
      if (streaming) {
        continue;
      }
      return null;
    }
    todos.push(todo);
  }
  if (todos.length === 0 && !streaming) {
    return null;
  }
  return todos;
}

function _parseTodo(rawTodo: unknown): TodoItem | null {
  if (typeof rawTodo !== "object" || rawTodo === null) {
    return null;
  }
  const todo = rawTodo as Record<string, unknown>;
  if (typeof todo.content !== "string" || todo.content === "") {
    return null;
  }
  if (
    todo.status !== "pending" &&
    todo.status !== "in_progress" &&
    todo.status !== "completed" &&
    todo.status !== "cancelled"
  ) {
    return null;
  }
  return { content: todo.content, status: todo.status };
}
