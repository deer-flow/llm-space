import { describe, expect, test } from "bun:test";

import type { Thread } from "@llm-space/core";

import { createThreadStore } from "../../../../src/components/thread-playground/stores";

const INVALID_THREAD: Thread = {
  context: {
    messages: [
      {
        content: [{ text: "Question", type: "text" }],
        id: "user-one",
        role: "user",
      },
      {
        content: [{ text: "Answer", type: "text" }],
        id: "assistant-one",
        role: "assistant",
      },
    ],
  },
  model: { id: "model", provider: "fake" },
};

describe("inline run validation", () => {
  test("scopes feedback to the blocking message", async () => {
    let transportCalls = 0;
    const store = createThreadStore(INVALID_THREAD, {
      resolveModel: (saved) => saved ?? null,
      transport: () => {
        transportCalls += 1;
        throw new Error("Transport should not run for invalid input");
      },
    });

    await store.getState().run();

    expect(store.getState().runValidationIssue).toMatchObject({
      code: "lastAssistantMessage",
      level: "warning",
      messageId: "assistant-one",
      resolution: { type: "appendUserMessage" },
    });
    expect(transportCalls).toBe(0);

    store.getState().updateMessageTextContent("assistant-one", "Edited answer");
    expect(store.getState().runValidationIssue?.messageId).toBe(
      "assistant-one"
    );

    store.getState().resolveRunValidationIssue();
    const messages = store.getState().thread.context?.messages ?? [];
    expect(store.getState().runValidationIssue).toBeNull();
    expect(messages.at(-1)?.role).toBe("user");
    expect(store.getState().autoFocusMessageId).toBe(
      messages.at(-1)?.id ?? null
    );
  });

  test("clears feedback when the blocking role becomes runnable", async () => {
    const store = createThreadStore(INVALID_THREAD, {
      resolveModel: (saved) => saved ?? null,
      transport: () => {
        throw new Error("Transport should not run for invalid input");
      },
    });

    await store.getState().run();
    store.getState().toggleMessageRole("assistant-one");

    expect(store.getState().runValidationIssue).toBeNull();
  });
});
