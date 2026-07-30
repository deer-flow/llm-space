import { describe, expect, test } from "bun:test";

import type { ThreadContext } from "../types";

import { convertToPiContext } from "./converters";

describe("convertToPiContext", () => {
  test("passes pi-compatible tool-result image content through", () => {
    const context: ThreadContext = {
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: [],
          toolCalls: [
            {
              id: "tool-1",
              input: { name: "read", arguments: { path: "/tmp/pixel.png" } },
              output: {
                content: [
                  { type: "text", text: "[image file: pixel.png]" },
                  {
                    type: "image",
                    data: "cG5nLWJ5dGVz",
                    mimeType: "image/png",
                  },
                ],
                isError: false,
              },
            },
          ],
        },
      ],
    };

    expect(convertToPiContext(context).messages[1]).toMatchObject({
      role: "toolResult",
      toolCallId: "tool-1",
      toolName: "read",
      content: [
        { type: "text", text: "[image file: pixel.png]" },
        { type: "image", data: "cG5nLWJ5dGVz", mimeType: "image/png" },
      ],
      isError: false,
    });
  });
});
