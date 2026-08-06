import { describe, expect, test } from "bun:test";

import type { AgentEvent } from "@earendil-works/pi-agent-core";

import { reduceMessages } from "./reducer";

describe("reduceMessages final Responses metadata", () => {
  test("message_end maps provider activity, annotations, and response output", () => {
    const responseOutput = [{ id: "ws_1", type: "web_search_call" }];
    const event = {
      type: "message_end",
      message: {
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
        nativeToolActivities: [
          {
            id: "ws_1",
            type: "web_search_call",
            raw: responseOutput[0],
          },
        ],
        responseOutputItems: responseOutput,
        api: "openai-responses",
        provider: "openai",
        model: "gpt-test",
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: Date.now(),
      },
    } as AgentEvent;

    const reduced = reduceMessages(event, {
      streamingMessage: { id: "assistant-1", role: "assistant", content: [] },
    });

    expect(reduced?.message.providerHostedToolActivities).toHaveLength(1);
    expect(reduced?.message.content[0]?.annotations?.[0]?.url).toBe(
      "https://example.com"
    );
    expect(reduced?.message.responseOutputItems).toEqual(responseOutput);
    expect(reduced?.message.toolCalls).toBeUndefined();
  });
});

describe("reduceMessages tool-call argument previews", () => {
  test("freezes a large live preview and restores complete arguments at toolcall_end", () => {
    let reduced = reduceMessages(
      { type: "message_start", message: { role: "assistant" } } as AgentEvent,
      {}
    );
    expect(reduced).not.toBeNull();

    reduced = reduceMessages(
      {
        type: "message_update",
        assistantMessageEvent: {
          type: "toolcall_start",
          contentIndex: 0,
          partial: {
            content: [
              {
                type: "toolCall",
                id: "write-1",
                name: "write",
                arguments: {},
              },
            ],
          },
        },
      } as unknown as AgentEvent,
      { streamingMessage: reduced!.message, content: reduced!.content }
    );

    reduced = reduceMessages(
      {
        type: "message_update",
        assistantMessageEvent: {
          type: "toolcall_delta",
          contentIndex: 0,
          delta: '{"path":"/tmp/large.txt","content":"',
        },
      } as AgentEvent,
      { streamingMessage: reduced!.message, content: reduced!.content }
    );
    expect(reduced?.message.toolCalls?.[0]?.input.arguments).toMatchObject({
      path: "/tmp/large.txt",
    });

    reduced = reduceMessages(
      {
        type: "message_update",
        assistantMessageEvent: {
          type: "toolcall_delta",
          contentIndex: 0,
          delta: "x".repeat(10_000),
        },
      } as AgentEvent,
      { streamingMessage: reduced!.message, content: reduced!.content }
    );
    const frozenMessage = reduced!.message;
    const frozenArguments = frozenMessage.toolCalls?.[0]?.input.arguments as
      | Record<string, unknown>
      | undefined;
    const frozenContent = frozenArguments?.content;
    expect(typeof frozenContent).toBe("string");
    expect((frozenContent as string).length).toBeLessThanOrEqual(1024);

    reduced = reduceMessages(
      {
        type: "message_update",
        assistantMessageEvent: {
          type: "toolcall_delta",
          contentIndex: 0,
          delta: "not-visible-in-the-frozen-preview",
        },
      } as AgentEvent,
      { streamingMessage: reduced!.message, content: reduced!.content }
    );
    expect(reduced?.message).toBe(frozenMessage);

    const finalArguments = {
      path: "/tmp/large.txt",
      content: "x".repeat(10_000) + "not-visible-in-the-frozen-preview",
    };
    reduced = reduceMessages(
      {
        type: "message_update",
        assistantMessageEvent: {
          type: "toolcall_end",
          contentIndex: 0,
          toolCall: {
            type: "toolCall",
            id: "write-1",
            name: "write",
            arguments: finalArguments,
          },
        },
      } as unknown as AgentEvent,
      { streamingMessage: reduced!.message, content: reduced!.content }
    );

    expect(reduced?.message.toolCalls?.[0]?.input).toEqual({
      name: "write",
      arguments: finalArguments,
      partialArguments: undefined,
    });
  });
});
