import { describe, expect, test } from "bun:test";

import { convertToPiContext } from "../../src/client/converters";
import type { ThreadContext } from "../../src/types";

describe("convertToPiContext", () => {
  test("lowers persisted Agent status timestamps and sidecar metadata", () => {
    const userTimestamp = Date.UTC(2026, 7, 19, 6, 10, 10, 123);
    const toolTimestamp = Date.UTC(2026, 7, 19, 6, 10, 18, 123);
    const toolMetadata = {
      timestamp: toolTimestamp,
      ordinal: 2,
      todos: [
        {
          id: "todo-1",
          content: "验证转换器",
          status: "in_progress" as const,
          timestamp: toolTimestamp,
        },
      ],
      effects: [
        {
          type: "working-directory" as const,
          workingDirectory: "C:\\repo\\packages\\core",
        },
      ],
    };
    const context: ThreadContext = {
      agentStatus: {
        components: ["timestamps", "tool-counter", "todos", "system"],
        simulatedTimeOffsetMs: 86_400_000,
      },
      variables: {
        current_working_directory: {
          type: "workingDirectory",
          value: "C:\\repo",
        },
      },
      messages: [
        {
          id: "user-1",
          role: "user",
          content: [{ type: "text", text: "检查项目" }],
          agentStatus: { timestamp: userTimestamp },
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: [],
          toolCalls: [
            {
              id: "tool-1",
              input: {
                name: "read",
                arguments: { path: "package.json" },
              },
              output: {
                content: [{ type: "text", text: "文件内容" }],
                isError: false,
                agentStatus: toolMetadata,
              },
            },
          ],
        },
      ],
    };

    const result = convertToPiContext(context);

    expect(result.messages[0]).toMatchObject({
      role: "user",
      timestamp: userTimestamp,
    });
    expect(result.messages[1]).toMatchObject({
      role: "assistant",
      timestamp: 0,
    });
    expect(result.messages[2]).toMatchObject({
      role: "toolResult",
      toolCallId: "tool-1",
      timestamp: toolTimestamp,
    });
    expect(result.agentStatus).toEqual({
      components: ["timestamps", "tool-counter", "todos", "system"],
      simulatedTimeOffsetMs: 86_400_000,
      workingDirectory: "C:\\repo",
      toolCallMetadata: {
        "tool-1": toolMetadata,
      },
    });
  });

  test("preserves Agent status metadata for prototype-like tool call ids", () => {
    const context: ThreadContext = {
      messages: [
        {
          id: "assistant-prototype-id",
          role: "assistant",
          content: [],
          toolCalls: [
            {
              id: "__proto__",
              input: { name: "read", arguments: {} },
              output: {
                content: [{ type: "text", text: "安全结果" }],
                agentStatus: { ordinal: 1 },
              },
            },
          ],
        },
      ],
    };

    const metadata = convertToPiContext(context).agentStatus?.toolCallMetadata;

    expect(metadata).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(metadata, "__proto__")).toBe(
      true
    );
    expect(metadata?.__proto__).toEqual({ ordinal: 1 });
  });

  test("uses stable zero timestamps for legacy messages", () => {
    const context: ThreadContext = {
      messages: [
        {
          id: "user-legacy",
          role: "user",
          content: [{ type: "text", text: "旧消息" }],
        },
        {
          id: "assistant-legacy",
          role: "assistant",
          content: [],
          toolCalls: [
            {
              id: "tool-legacy",
              input: { name: "read", arguments: {} },
              output: {
                content: [{ type: "text", text: "旧工具响应" }],
              },
            },
          ],
        },
      ],
    };

    const first = convertToPiContext(context);
    const second = convertToPiContext(context);

    expect(first.messages.map((message) => message.timestamp)).toEqual([
      0, 0, 0,
    ]);
    expect(second.messages.map((message) => message.timestamp)).toEqual([
      0, 0, 0,
    ]);
  });

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
