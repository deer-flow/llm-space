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
