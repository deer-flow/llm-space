import { describe, expect, test } from "bun:test";

import { convertToPiContext } from "../../src/client/converters";
import type { ThreadContext } from "../../src/types";


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

  test("separates provider-hosted configs from client tools", () => {
    const result = convertToPiContext({
      messages: [],
      tools: [
        {
          type: "function",
          name: "lookup",
          description: "Lookup",
          parameters: { type: "object" },
        },
        {
          type: "plugin",
          pluginId: "project-kit",
          toolId: "plugin:project-kit:tool:project-info",
          name: "project_info",
          description: "Read project information",
          parameters: { type: "object" },
        },
        {
          type: "provider-hosted",
          config: {
            type: "web_search",
            search_context_size: "high",
            user_location: { type: "approximate", country: "CN" },
          },
        },
      ],
    });

    expect(result.tools).toEqual([
      { name: "lookup", description: "Lookup", parameters: { type: "object" } },
      {
        name: "project_info",
        description: "Read project information",
        parameters: { type: "object" },
      },
    ]);
    expect(result.responseApiNativeTools).toEqual([
      {
        type: "web_search",
        search_context_size: "high",
        user_location: { type: "approximate", country: "CN" },
      },
    ]);
  });

  test("preserves response replay metadata on assistant messages", () => {
    const result = convertToPiContext({
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Result",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://example.com",
                  startIndex: 0,
                  endIndex: 6,
                  raw: { type: "url_citation", url: "https://example.com" },
                },
              ],
            },
          ],
          providerHostedToolActivities: [
            {
              id: "ws_1",
              type: "web_search_call",
              raw: { id: "ws_1", type: "web_search_call" },
            },
          ],
          responseOutputItems: [{ id: "ws_1", type: "web_search_call" }],
        },
      ],
    });

    const assistant = result.messages[0];
    expect(assistant?.role).toBe("assistant");
    if (assistant?.role !== "assistant") throw new Error("Expected assistant");
    expect(assistant.content[0]).toMatchObject({
      type: "text",
      annotations: [{ url: "https://example.com" }],
    });
    expect(assistant.nativeToolActivities).toHaveLength(1);
    expect(assistant.responseOutputItems).toEqual([
      { id: "ws_1", type: "web_search_call" },
    ]);
  });
});
