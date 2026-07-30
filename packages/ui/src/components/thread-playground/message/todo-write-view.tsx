import { CheckIcon, XIcon } from "lucide-react";
import { memo } from "react";

import { cn } from "@llm-space/ui/lib/utils";

import type { TodoItem } from "./todo-write-input";

type TodoStatus = TodoItem["status"];

/**
 * A read-only, card-style rendering of a `todo_write` call.
 */
function _TodoWriteView({ todos }: { todos: readonly TodoItem[] }) {
  return (
    <div
      className="flex w-full flex-col gap-2 rounded-lg bg-(--textarea) px-3 py-2.5 select-auto"
      data-slot="todo-write-view"
    >
      <div className="text-muted-foreground text-xs">
        <span className="font-mono">
          <span className="text-primary">todo_write</span>
          <span>()</span>
        </span>
      </div>
      <ul className="flex flex-col gap-0.5">
        {todos.map((todo, index) => (
          <TodoRow key={index} content={todo.content} status={todo.status} />
        ))}
      </ul>
    </div>
  );
}
export const TodoWriteView = memo(_TodoWriteView, (previous, next) =>
  _areTodosEqual(previous.todos, next.todos)
);

function _TodoRow({
  content,
  status,
}: {
  content: string;
  status: TodoStatus;
}) {
  const completed = status === "completed";
  const cancelled = status === "cancelled";
  const inProgress = status === "in_progress";
  return (
    <li className="flex items-start gap-2 py-1 text-sm">
      <_TodoStatusIcon status={status} />
      <span
        className={cn(
          "min-w-0 leading-5",
          (completed || cancelled) &&
            "text-muted-foreground line-through opacity-70",
          inProgress && "text-primary font-medium",
          !completed && !cancelled && !inProgress && "text-foreground/90"
        )}
      >
        {content}
      </span>
    </li>
  );
}
const TodoRow = memo(_TodoRow);

function _TodoStatusIcon({ status }: { status: TodoStatus }) {
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
  if (status === "cancelled") {
    return (
      <span className="border-muted-foreground/40 text-muted-foreground mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border">
        <XIcon className="size-3" />
      </span>
    );
  }
  return (
    <span className="border-muted-foreground/50 mt-0.5 size-4 shrink-0 rounded-full border" />
  );
}

function _areTodosEqual(
  previous: readonly TodoItem[],
  next: readonly TodoItem[]
): boolean {
  return (
    previous.length === next.length &&
    previous.every(
      (todo, index) =>
        todo.content === next[index]?.content &&
        todo.status === next[index]?.status
    )
  );
}
