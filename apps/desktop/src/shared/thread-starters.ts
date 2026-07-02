import type { Thread } from "@llm-space/core";
import { uuid } from "@llm-space/core";

export const STARTER_THREAD_STEM = "agent-starter";
export type ThreadTemplate = "blank" | "starter";

/**
 * Create a blank thread for power users who want a fully empty canvas. The
 * caller supplies the title derived from the file path; the only seeded content
 * is one empty user message so the editor has a focused place to type.
 */
export function createBlankThread(title: string): Thread {
  return {
    title,
    context: {
      messages: [
        { id: uuid(), role: "user", content: [{ type: "text", text: "" }] },
      ],
    },
  };
}

/**
 * Create the first-use starter thread. It is intentionally model-agnostic and
 * tool-free so a newly configured provider can produce a useful first answer
 * without stopping on a stub tool call.
 */
export function createStarterThread(title: string): Thread {
  return {
    title,
    context: {
      systemPrompt: [
        "You are a concise assistant inside LLM Space.",
        "Help the user test a new agent thread quickly.",
      ].join("\n"),
      messages: [
        {
          id: uuid(),
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "Help me make a tiny weather helper agent.",
                "",
                "Return:",
                "1. its goal,",
                "2. one tool it needs,",
                "3. one way to check if a run is good.",
              ].join("\n"),
            },
          ],
        },
      ],
    },
  };
}
