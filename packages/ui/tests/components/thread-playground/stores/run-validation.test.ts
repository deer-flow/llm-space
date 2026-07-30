import { describe, expect, test } from "bun:test";

import type { Message } from "@llm-space/core";

import { getRunValidationIssue } from "../../../../src/components/thread-playground/stores";

describe("getRunValidationIssue", () => {
  test("identifies the message that prevents a run", () => {
    const assistant: Message = {
      content: [{ text: "Answer", type: "text" }],
      id: "assistant-one",
      role: "assistant",
    };

    expect(getRunValidationIssue([assistant])).toEqual({
      code: "lastAssistantMessage",
      level: "warning",
      message: "Please add a user message to run",
      messageId: "assistant-one",
      resolution: {
        type: "appendUserMessage",
      },
    });
  });

  test("accepts an empty user message", () => {
    const emptyUser: Message = {
      content: [{ text: "", type: "text" }],
      id: "user-empty",
      role: "user",
    };

    expect(getRunValidationIssue([emptyUser])).toBeNull();
  });
});
