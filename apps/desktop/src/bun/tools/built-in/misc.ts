import type { BuiltinTool } from "@llm-space/core";

import type { ToolEntry } from "../tool-registry";

// -- todo_write ---------------------------------------------------------------

export const todoWriteTool: BuiltinTool = {
  type: "builtin",
  name: "todo_write",
  icon: "list-todo",
  description:
    "Creates or updates the assistant's visible todo list for tracking multi-step work. Only use for non-trivial tasks with several concrete steps where tracking progress helps the user — skip it for single-step or trivial requests, where it just adds overhead. Each call replaces the entire list, so pass the full set of todos every time, and keep statuses current as work progresses.",
  strict: true,
  parameters: {
    type: "object",
    required: ["todos"],
    properties: {
      todos: {
        type: "array",
        description: "The complete set of todo items to display.",
        items: {
          type: "object",
          required: ["content", "status"],
          properties: {
            content: {
              type: "string",
              description: "Short description of the work item.",
            },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed", "cancelled"],
              description: "Current state of the todo item.",
            },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
};

export async function todo_write(): Promise<"OK"> {
  return Promise.resolve("OK");
}

// -- sleep --------------------------------------------------------------------

export const sleepTool: BuiltinTool = {
  type: "builtin",
  name: "sleep",
  icon: "timer",
  description:
    "Pause for a given number of milliseconds before returning. Use to wait between polling steps or to space out actions.",
  strict: true,
  parameters: {
    type: "object",
    required: ["description", "duration_ms"],
    properties: {
      description: {
        type: "string",
        description:
          "Must be the first parameter in the tool call. A short human-readable summary explaining why the sleep is being performed",
      },
      duration_ms: {
        type: "number",
        description: "How long to sleep, in milliseconds.",
      },
    },
    additionalProperties: false,
  },
};

export async function sleep(durationMs: number): Promise<"OK"> {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new Error("duration_ms must be a non-negative number.");
  }
  await new Promise((resolve) => setTimeout(resolve, durationMs));
  return "OK";
}

// -- ask_user_question --------------------------------------------------------

export const askUserQuestionTool: BuiltinTool = {
  type: "builtin",
  name: "ask_user_question",
  icon: "circle-help",
  // Always ends the run: its answer must come from a human, so it can never be
  // auto-executed (not by "auto run tools", not by the ReAct loop).
  terminate: true,
  description:
    'Collect structured multiple-choice answers from the user. Use only when blocked on a decision that is genuinely the user\'s to make — one you cannot resolve from the request, the code, or sensible defaults. Each question must have at least 2 options; users can always select "Other" for custom text. Set multi_select to true for multi-select questions.',
  strict: true,
  parameters: {
    type: "object",
    required: ["questions"],
    properties: {
      questions: {
        type: "array",
        description:
          "A list of 1–4 parallel, independent questions with predefined answer choices.",
        items: {
          type: "object",
          required: ["question", "header", "options", "multi_select"],
          properties: {
            question: {
              type: "string",
              description:
                "Full question text. Be specific and end with a question mark where appropriate.",
            },
            header: {
              type: "string",
              description:
                "Very short tab or tag label for the question, maximum 12 characters, for example Auth or Library.",
            },
            options: {
              type: "array",
              description:
                "A list of 2–4 distinct selectable choices. Choices are mutually exclusive unless multi_select is true.",
              items: {
                type: "object",
                required: ["label", "description"],
                properties: {
                  label: {
                    type: "string",
                    description:
                      "Short display label for this choice, ideally 1–5 words.",
                  },
                  description: {
                    type: "string",
                    description:
                      "Explanation of what this choice means or implies.",
                  },
                  preview: {
                    type: "string",
                    description:
                      "Optional markdown preview shown when this option is focused. Intended for single-select questions only.",
                  },
                },
                additionalProperties: false,
              },
            },
            multi_select: {
              type: "boolean",
              description:
                "If true, the user may select multiple options. If false, the user must select exactly one option.",
            },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
};

// -- registry -----------------------------------------------------------------

export const miscBuiltInTools: ToolEntry[] = [
  {
    tool: todoWriteTool,
    async execute() {
      return todo_write();
    },
  },
  {
    tool: sleepTool,
    async execute(args: Record<string, unknown>) {
      const durationMs = args.duration_ms;
      if (typeof durationMs !== "number") {
        throw new Error("duration_ms must be a number.");
      }
      return sleep(durationMs);
    },
  },
  {
    tool: askUserQuestionTool,
    // Never auto-executed: `terminate` keeps it out of every auto-run path. This
    // guard only fires if it is somehow invoked directly.
    execute() {
      return Promise.reject(
        new Error(
          "ask_user_question needs a human answer and cannot be executed automatically."
        )
      );
    },
  },
];
