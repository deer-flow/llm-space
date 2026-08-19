import { describe, expect, test } from "bun:test";

import type { AssistantMessage, Message } from "@llm-space/core";

import { resolveDisplayMessages } from "../../../../src/components/thread-playground/message/display-messages";

const userMessage: Message = {
  id: "user-1",
  role: "user",
  content: [{ type: "text", text: "Go" }],
};

const assistantMessage: AssistantMessage = {
  id: "assistant-1",
  role: "assistant",
  content: [{ type: "text", text: "A long response" }],
};

describe("resolveDisplayMessages", () => {
  test("places the live assistant message in the virtualized sequence", () => {
    const rows = resolveDisplayMessages(
      [userMessage],
      assistantMessage.id,
      true
    );

    expect(rows).toEqual([
      { message: userMessage, streaming: false },
      {
        message: { id: assistantMessage.id, role: "assistant", content: [] },
        streaming: true,
      },
    ]);
  });

  test("folds a committed streaming id into one stable row", () => {
    const rows = resolveDisplayMessages(
      [userMessage, assistantMessage],
      assistantMessage.id,
      true
    );

    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({ message: assistantMessage, streaming: true });
  });

  test("does not append a blank placeholder after an assistant commits", () => {
    expect(
      resolveDisplayMessages([userMessage, assistantMessage], null, true)
    ).toEqual([
      { message: userMessage, streaming: false },
      { message: assistantMessage, streaming: false },
    ]);
  });
});
