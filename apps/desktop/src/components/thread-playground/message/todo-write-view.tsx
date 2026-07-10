import { type ToolCallInput } from "@llm-space/core";
import { CheckIcon, EyeIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";

import { PreviewDialog } from "@/components/preview-dialog-lazy";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TodoStatus = "pending" | "in_progress" | "completed";

interface TodoItem {
  content: string;
  status: TodoStatus;
}

/**
 * Validate a tool call's input against the `todo_write` shape and, on success,
 * return the normalized todo list. Returns `null` for any other tool or a
 * malformed payload, so the caller falls back to the default input view.
 */
export function parseTodoWriteInput(input: ToolCallInput): TodoItem[] | null {
  if (input.name !== "todo_write") {
    return null;
  }
  const rawTodos = (input.arguments as Record<string, unknown>)?.todos;
  if (!Array.isArray(rawTodos) || rawTodos.length === 0) {
    return null;
  }

  const todos: TodoItem[] = [];
  for (const rawTodo of rawTodos) {
    if (typeof rawTodo !== "object" || rawTodo === null) {
      return null;
    }
    const t = rawTodo as Record<string, unknown>;
    if (typeof t.content !== "string" || t.content === "") {
      return null;
    }
    todos.push({
      content: t.content,
      status: _normalizeStatus(t.status),
    });
  }
  return todos;
}

function _normalizeStatus(value: unknown): TodoStatus {
  return value === "completed" || value === "in_progress" ? value : "pending";
}

/**
 * A read-only, card-style rendering of a `todo_write` call: each todo is a row
 * with a leading status affordance — an empty circle (pending), a spinner
 * (in_progress), or a filled check (completed, struck through and dimmed).
 */
function _TodoWriteView({
  todos,
  input,
}: {
  todos: TodoItem[];
  input: ToolCallInput;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewValue = useMemo(
    () => JSON.stringify(input.arguments, null, 2) ?? "",
    [input.arguments]
  );
  return (
    <div className="flex w-full flex-col gap-2 rounded-lg bg-(--textarea) px-3 py-2.5 select-auto">
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span className="font-mono">
          <span className="text-primary">todo_write</span>
          <span>()</span>
        </span>
        <div className="flex items-center gap-2">
          <Tooltip content="View arguments">
            <Button
              className="invisible shrink-0 group-hover/message:visible"
              size="xs"
              variant="ghost"
              onClick={() => setPreviewOpen(true)}
            >
              <EyeIcon className="size-3" />
            </Button>
          </Tooltip>
        </div>
      </div>
      <PreviewDialog
        open={previewOpen}
        title="Arguments of todo_write()"
        type="json"
        value={previewValue}
        onOpenChange={setPreviewOpen}
      />
      <ul className="flex flex-col gap-0.5">
        {todos.map((todo, index) => (
          <TodoRow key={index} todo={todo} />
        ))}
      </ul>
    </div>
  );
}
export const TodoWriteView = memo(_TodoWriteView);

function TodoRow({ todo }: { todo: TodoItem }) {
  const completed = todo.status === "completed";
  const inProgress = todo.status === "in_progress";
  return (
    <li className="flex items-start gap-2 py-1 text-sm">
      <TodoStatusIcon status={todo.status} />
      <span
        className={cn(
          "min-w-0 leading-5",
          completed && "text-muted-foreground line-through opacity-70",
          inProgress && "text-primary font-medium",
          !completed && !inProgress && "text-foreground/90"
        )}
      >
        {todo.content}
      </span>
    </li>
  );
}

function TodoStatusIcon({ status }: { status: TodoStatus }) {
  if (status === "completed") {
    return (
      <span className="border-muted-foreground/40 bg-muted-foreground/30 text-background mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border">
        <CheckIcon className="size-3" />
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="border-primary mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border">
        <span className="bg-primary size-1.5 rounded-full" />
      </span>
    );
  }
  return (
    <span className="border-muted-foreground/50 mt-0.5 size-4 shrink-0 rounded-full border" />
  );
}
