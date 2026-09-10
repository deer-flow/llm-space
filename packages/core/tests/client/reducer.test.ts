import { describe, expect, test } from "bun:test";

import type { AgentEvent } from "@earendil-works/pi-agent-core";

import { reduceMessages } from "../../src/client/reducer";
import type { ReducedMessageContent } from "../../src/client/reducer";
import type {
  AssistantMessage,
  ModelUsage,
  ToolCallOutput,
} from "../../src/types";

type Reduced = NonNullable<ReturnType<typeof reduceMessages>>;

interface StreamState {
  streamingMessage: AssistantMessage | null;
  content: ReducedMessageContent[];
}

/** Fold events through the reducer the way the streaming callers do. */
function reduceAll(events: AgentEvent[]): {
  results: Reduced[];
  state: StreamState;
} {
  const state: StreamState = { streamingMessage: null, content: [] };
  const results: Reduced[] = [];
  for (const event of events) {
    const reduced = reduceMessages(event, state);
    if (reduced) {
      state.streamingMessage = reduced.message;
      state.content = reduced.content;
      results.push(reduced);
    }
  }
  return { results, state };
}

const messageStart = (): AgentEvent =>
  ({
    type: "message_start",
    message: { role: "assistant", content: [] },
  }) as unknown as AgentEvent;

const messageEnd = (message: unknown): AgentEvent =>
  ({ type: "message_end", message }) as AgentEvent;

const textStart = (contentIndex: number): AgentEvent =>
  ({
    type: "message_update",
    assistantMessageEvent: { type: "text_start", contentIndex },
  }) as AgentEvent;

const textDelta = (contentIndex: number, delta: string): AgentEvent =>
  ({
    type: "message_update",
    assistantMessageEvent: { type: "text_delta", contentIndex, delta },
  }) as AgentEvent;

const thinkingStart = (contentIndex: number): AgentEvent =>
  ({
    type: "message_update",
    assistantMessageEvent: { type: "thinking_start", contentIndex },
  }) as AgentEvent;

const thinkingDelta = (contentIndex: number, delta: string): AgentEvent =>
  ({
    type: "message_update",
    assistantMessageEvent: { type: "thinking_delta", contentIndex, delta },
  }) as AgentEvent;

const toolcallStart = (contentIndex: number): AgentEvent =>
  ({
    type: "message_update",
    assistantMessageEvent: {
      type: "toolcall_start",
      contentIndex,
      partial: {
        content: [
          { type: "tool_call", id: "tc-1", name: "get_weather", arguments: {} },
        ],
      },
    },
  }) as unknown as AgentEvent;

const toolcallDelta = (contentIndex: number, delta: string): AgentEvent =>
  ({
    type: "message_update",
    assistantMessageEvent: { type: "toolcall_delta", contentIndex, delta },
  }) as AgentEvent;

const toolExecutionEnd = (result: unknown): AgentEvent =>
  ({ type: "tool_execution_end", toolCallId: "tc-1", result }) as AgentEvent;

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

describe("reduceMessages text streaming", () => {
  test("streams a text turn from message_start to message_end", () => {
    const { results, state } = reduceAll([
      messageStart(),
      textStart(0),
      textDelta(0, "Hello "),
      textDelta(0, "world"),
      messageEnd({
        role: "assistant",
        content: [{ type: "text", text: "Hello world" }],
      }),
    ]);

    expect(results.map((result) => result.type)).toEqual([
      "message_start",
      "message_update",
      "message_update",
      "message_update",
      "message_end",
    ]);
    const [start, emptyBlock, firstDelta, secondDelta, end] = results;
    expect(start?.message.content).toEqual([]);
    expect(emptyBlock?.message.content).toEqual([{ type: "text", text: "" }]);
    expect(firstDelta?.message.content).toEqual([
      { type: "text", text: "Hello " },
    ]);
    expect(secondDelta?.message.content).toEqual([
      { type: "text", text: "Hello world" },
    ]);
    expect(end?.message.content).toEqual([{ type: "text", text: "Hello world" }]);
    expect(end?.message.id).toBeTruthy();
    expect(state.streamingMessage?.content).toEqual([
      { type: "text", text: "Hello world" },
    ]);
    expect(state.content).toEqual([]);
  });

  test("keeps interleaved text blocks through thinking runs", () => {
    const { results, state } = reduceAll([
      messageStart(),
      textStart(0),
      textDelta(0, "Before"),
      thinkingStart(1),
      thinkingDelta(1, "pondering"),
      textStart(2),
      textDelta(2, "After"),
    ]);

    const last = results[results.length - 1];
    expect(last?.message.content).toEqual([
      { type: "text", text: "Before" },
      { type: "text", text: "After" },
    ]);
    expect(last?.message.thinking).toBe("pondering");

    const withoutProviderText = reduceMessages(
      messageEnd({ role: "assistant", content: [] }),
      state
    );
    expect(withoutProviderText?.message.content).toEqual([
      { type: "text", text: "Before" },
      { type: "text", text: "After" },
    ]);

    const withProviderText = reduceMessages(
      messageEnd({
        role: "assistant",
        content: [{ type: "text", text: "Corrected" }],
      }),
      state
    );
    expect(withProviderText?.message.content).toEqual([
      { type: "text", text: "Corrected" },
    ]);
  });
});

describe("reduceMessages events without message_start", () => {
  test.each([
    {
      label: "tool_execution_end",
      event: toolExecutionEnd({ content: [{ type: "text", text: "18C" }] }),
    },
    { label: "text_delta", event: textDelta(0, "orphan") },
    { label: "toolcall_delta", event: toolcallDelta(0, '{"city":') },
  ])("ignores $label before message_start", ({ event }) => {
    expect(
      reduceMessages(event, { streamingMessage: null, content: [] })
    ).toBeNull();
  });

  test("rebuilds the final message from an orphan message_end", () => {
    const reduced = reduceMessages(
      messageEnd({
        role: "assistant",
        content: [{ type: "text", text: "Recovered" }],
      }),
      { streamingMessage: null, content: [] }
    );

    expect(reduced?.type).toBe("message_end");
    expect(reduced?.message.role).toBe("assistant");
    expect(reduced?.message.content).toEqual([
      { type: "text", text: "Recovered" },
    ]);
  });

  test("drops an orphan message_end without assistant payload", () => {
    const reduced = reduceMessages(
      messageEnd({ role: "user", content: [] }),
      { streamingMessage: null, content: [] }
    );

    expect(reduced).toBeNull();
  });
});

describe("reduceMessages tool calls", () => {
  test("keeps the partial fallback while argument JSON fails to parse", () => {
    const { results } = reduceAll([
      messageStart(),
      toolcallStart(0),
      toolcallDelta(0, ":atom"),
    ]);

    const last = results[results.length - 1];
    expect(last?.type).toBe("message_update");
    expect(last?.message.toolCalls).toEqual([
      {
        id: "tc-1",
        input: { name: "get_weather", arguments: {}, partialArguments: "" },
      },
    ]);
  });

  test("parses complete argument JSON", () => {
    const { results } = reduceAll([
      messageStart(),
      toolcallStart(0),
      toolcallDelta(0, '{"city": "Paris"}'),
    ]);

    const last = results[results.length - 1];
    expect(last?.message.toolCalls).toEqual([
      {
        id: "tc-1",
        input: { name: "get_weather", arguments: { city: "Paris" } },
      },
    ]);
  });

  test("attaches the tool result on tool_execution_end", () => {
    const result: ToolCallOutput = {
      content: [{ type: "text", text: "18C" }],
    };
    const { results } = reduceAll([
      messageStart(),
      toolcallStart(0),
      toolExecutionEnd(result),
    ]);

    const last = results[results.length - 1];
    expect(last?.type).toBe("message_update");
    expect(last?.message.toolCalls?.[0]?.output).toEqual(result);
  });
});

describe("reduceMessages usage normalization", () => {
  const zeroCost = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  };

  const foldUsage = (usage: unknown): ModelUsage | undefined =>
    reduceMessages(messageEnd({ role: "assistant", content: [], usage }), {
      streamingMessage: { id: "m-1", role: "assistant", content: [] },
      content: [],
    })?.message.usage;

  test.each([
    {
      label: "maps provider totals",
      usage: {
        input: 10,
        output: 5,
        cacheRead: 2,
        cacheWrite: 1,
        totalTokens: 18,
        cost: {
          input: 0.1,
          output: 0.2,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0.3,
        },
      },
      expected: {
        input: 10,
        output: 5,
        cacheRead: 2,
        cacheWrite: 1,
        totalTokens: 18,
        cost: {
          input: 0.1,
          output: 0.2,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0.3,
        },
      },
    },
    {
      label: "keeps cost-only usage",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { ...zeroCost, total: 0.01 },
      },
      expected: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { ...zeroCost, total: 0.01 },
      },
    },
    {
      label: "omits all-zero usage",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: zeroCost,
      },
      expected: undefined,
    },
    {
      label: "clamps negative and non-finite values",
      usage: {
        input: -10,
        output: Number.NaN,
        cacheRead: 3,
        totalTokens: -1,
        cost: { ...zeroCost, input: 0.1 },
      },
      expected: {
        input: 0,
        output: 0,
        cacheRead: 3,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { ...zeroCost, input: 0.1 },
      },
    },
    {
      label: "derives missing totalTokens from the token split",
      usage: { input: 3, output: 4, cacheRead: 5, cacheWrite: 6 },
      expected: {
        input: 3,
        output: 4,
        cacheRead: 5,
        cacheWrite: 6,
        totalTokens: 18,
        cost: zeroCost,
      },
    },
    {
      label: "keeps finite reasoning tokens",
      usage: { input: 1, reasoning: 7, totalTokens: 8 },
      expected: {
        input: 1,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        reasoning: 7,
        totalTokens: 8,
        cost: zeroCost,
      },
    },
    {
      label: "drops non-finite reasoning tokens",
      usage: { input: 1, reasoning: Number.NaN, totalTokens: 1 },
      expected: {
        input: 1,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 1,
        cost: zeroCost,
      },
    },
    {
      label: "omits missing usage",
      usage: undefined,
      expected: undefined,
    },
  ])("$label", ({ usage, expected }) => {
    expect(foldUsage(usage)).toEqual(expected);
  });
});

describe("reduceMessages agent_end", () => {
  test("propagates assistant error messages", () => {
    const event = {
      type: "agent_end",
      messages: [
        { role: "user", content: [] },
        { role: "assistant", content: [], errorMessage: "rate limited" },
      ],
    } as unknown as AgentEvent;

    expect(() =>
      reduceMessages(event, { streamingMessage: null, content: [] })
    ).toThrow("rate limited");
  });

  test("returns null for a clean run", () => {
    const event = {
      type: "agent_end",
      messages: [{ role: "assistant", content: [] }],
    } as unknown as AgentEvent;

    expect(
      reduceMessages(event, { streamingMessage: null, content: [] })
    ).toBeNull();
  });
});
