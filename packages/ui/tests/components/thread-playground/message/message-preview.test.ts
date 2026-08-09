import { describe, expect, test } from "bun:test";

import type { Message } from "@llm-space/core";

import { messagePreview } from "../../../../src/components/thread-playground/message/message-preview";

describe("messagePreview", () => {
  test("normalizes text and describes image-only messages", () => {
    const textMessage: Message = {
      id: "user-text",
      role: "user",
      content: [{ type: "text", text: "  hello\n  world " }],
    };
    const imageMessage: Message = {
      id: "user-images",
      role: "user",
      content: [
        { type: "image", data: "a", mimeType: "image/png" },
        { type: "image", data: "b", mimeType: "image/png" },
      ],
    };
    expect(messagePreview(textMessage)).toBe("hello world");
    expect(messagePreview(imageMessage)).toBe("2 image attachments");
  });

  test("falls back through tool calls, hosted activity, thinking, and empty", () => {
    const toolMessage: Message = {
      id: "assistant-tool",
      role: "assistant",
      content: [],
      toolCalls: [
        { id: "tool-1", input: { name: "lookup", arguments: {} } },
      ],
    };
    const hostedMessage: Message = {
      id: "assistant-hosted",
      role: "assistant",
      content: [],
      providerHostedToolActivities: [
        {
          type: "web_search_call",
          raw: { type: "web_search_call" },
        },
      ],
    };
    const thinkingMessage: Message = {
      id: "assistant-thinking",
      role: "assistant",
      content: [],
      thinking: "  reason\n carefully ",
    };
    const emptyMessage: Message = {
      id: "assistant-empty",
      role: "assistant",
      content: [],
    };
    expect(messagePreview(toolMessage)).toBe("lookup()");
    expect(messagePreview(hostedMessage)).toBe("web_search_call");
    expect(messagePreview(thinkingMessage)).toBe("reason carefully");
    expect(messagePreview(emptyMessage)).toBe("Empty message");
  });
});
