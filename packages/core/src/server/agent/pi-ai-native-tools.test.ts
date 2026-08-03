import { afterEach, describe, expect, test } from "bun:test";

import type {
  AssistantMessage,
  Context,
  Model,
  ToolResultMessage,
} from "@earendil-works/pi-ai";
import { streamSimple as streamCodexResponses } from "@earendil-works/pi-ai/api/openai-codex-responses";
import { streamSimple } from "@earendil-works/pi-ai/api/openai-responses";

const ORIGINAL_FETCH = globalThis.fetch;

const MODEL: Model<"openai-responses"> = {
  id: "gpt-native-test",
  name: "GPT native test",
  api: "openai-responses",
  provider: "openai",
  baseUrl: "https://example.invalid/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 16_384,
};

const CODEX_MODEL: Model<"openai-codex-responses"> = {
  ...MODEL,
  id: "gpt-codex-native-test",
  name: "GPT Codex native test",
  api: "openai-codex-responses",
  provider: "openai-codex",
  baseUrl: "https://example.invalid/backend-api",
};

const FUNCTION_TOOL = {
  name: "lookup",
  description: "Look up a topic",
  parameters: {
    type: "object",
    properties: { topic: { type: "string" } },
    required: ["topic"],
  },
};

const RESPONSE_OUTPUT = [
  {
    id: "ws_1",
    type: "web_search_call",
    status: "completed",
    action: { type: "search", query: "LLM Space" },
  },
  {
    id: "fc_1",
    type: "function_call",
    status: "completed",
    call_id: "call_1",
    name: "lookup",
    arguments: '{"topic":"LLM Space"}',
  },
  {
    id: "msg_1",
    type: "message",
    role: "assistant",
    status: "completed",
    content: [
      {
        type: "output_text",
        text: "LLM Space is a workbench.",
        annotations: [
          {
            type: "url_citation",
            url: "https://example.com/llm-space",
            title: "LLM Space",
            start_index: 0,
            end_index: 9,
          },
        ],
      },
    ],
  },
] as const;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

function _sseResponse(): Response {
  const response = {
    id: "resp_1",
    object: "response",
    created_at: 1,
    model: MODEL.id,
    status: "completed",
    output: RESPONSE_OUTPUT,
    usage: {
      input_tokens: 10,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 5,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 15,
    },
  };
  const events = [
    { type: "response.created", response: { ...response, output: [] } },
    ...RESPONSE_OUTPUT.flatMap((item, outputIndex) => [
      {
        type: "response.output_item.added",
        output_index: outputIndex,
        item,
      },
      {
        type: "response.output_item.done",
        output_index: outputIndex,
        item,
      },
    ]),
    { type: "response.completed", response },
  ];
  const body = `${events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("")}data: [DONE]\n\n`;
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function _codexSseResponseWithSparseTerminalOutput(): Response {
  const terminalResponse = {
    id: "resp_codex_1",
    object: "response",
    created_at: 1,
    model: CODEX_MODEL.id,
    status: "completed",
    // Codex can omit earlier native items while still repeating the final
    // assistant message in the terminal response.
    output: [RESPONSE_OUTPUT[2]],
    usage: {
      input_tokens: 10,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 5,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 15,
    },
  };
  const events = [
    {
      type: "response.created",
      response: { ...terminalResponse, status: "in_progress" },
    },
    ...RESPONSE_OUTPUT.flatMap((item, outputIndex) => [
      {
        type: "response.output_item.added",
        output_index: outputIndex,
        item,
      },
      {
        type: "response.output_item.done",
        output_index: outputIndex,
        item,
      },
    ]),
    { type: "response.done", response: terminalResponse },
  ];
  const body = `${events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("")}data: [DONE]\n\n`;
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

async function _requestBody(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Record<string, unknown>> {
  if (input instanceof Request) {
    return (await input.clone().json()) as Record<string, unknown>;
  }
  if (typeof init?.body !== "string") {
    throw new Error("Expected a JSON request body");
  }
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe("pi-ai Responses native tools bridge", () => {
  test("preserves Codex native output items when the terminal event is sparse", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        _codexSseResponseWithSparseTerminalOutput()
      )) as unknown as typeof fetch;
    const jwtPayload = btoa(
      JSON.stringify({
        "https://api.openai.com/auth": {
          chatgpt_account_id: "account-test",
        },
      })
    );

    const result = await streamCodexResponses(
      CODEX_MODEL,
      {
        messages: [
          { role: "user", content: "Find LLM Space", timestamp: Date.now() },
        ],
        tools: [],
      },
      {
        apiKey: `header.${jwtPayload}.signature`,
        transport: "sse",
      }
    ).result();

    expect(result.responseOutputItems).toEqual([...RESPONSE_OUTPUT]);
    expect(result.nativeToolActivities?.[0]?.raw).toEqual(RESPONSE_OUTPUT[0]);
  });

  test("sends raw native tools and replays terminal output exactly once", async () => {
    const requestBodies: Record<string, unknown>[] = [];
    globalThis.fetch = (async (input, init) => {
      requestBodies.push(await _requestBody(input, init));
      return _sseResponse();
    }) as typeof fetch;

    const firstContext: Context = {
      messages: [
        { role: "user", content: "Find LLM Space", timestamp: Date.now() },
      ],
      tools: [FUNCTION_TOOL],
    };
    const first = await streamSimple(MODEL, firstContext, {
      apiKey: "test-key",
      responseApiNativeTools: [
        { type: "web_search", search_context_size: "high" },
      ],
    }).result();

    expect(requestBodies[0]?.tools).toEqual([
      {
        type: "function",
        name: "lookup",
        description: "Look up a topic",
        parameters: FUNCTION_TOOL.parameters,
      },
      { type: "web_search", search_context_size: "high" },
    ]);

    const nativeFirst = first as AssistantMessage & {
      nativeToolActivities?: Record<string, unknown>[];
      responseOutputItems?: Record<string, unknown>[];
    };
    expect(nativeFirst.nativeToolActivities?.[0]?.raw).toEqual(
      RESPONSE_OUTPUT[0]
    );
    expect(
      nativeFirst.content.find((block) => block.type === "text")?.annotations
    ).toEqual([
      {
        type: "url_citation",
        url: "https://example.com/llm-space",
        title: "LLM Space",
        startIndex: 0,
        endIndex: 9,
        raw: RESPONSE_OUTPUT[2].content[0].annotations[0],
      },
    ]);
    expect(nativeFirst.responseOutputItems).toEqual(
      RESPONSE_OUTPUT as unknown as Record<string, unknown>[]
    );

    const toolResult: ToolResultMessage = {
      role: "toolResult",
      toolCallId: "call_1|fc_1",
      toolName: "lookup",
      content: [{ type: "text", text: "lookup result" }],
      isError: false,
      timestamp: Date.now(),
    };
    await streamSimple(
      MODEL,
      {
        messages: [...firstContext.messages, nativeFirst, toolResult],
        tools: [FUNCTION_TOOL],
      },
      { apiKey: "test-key" }
    ).result();

    const secondInput = requestBodies[1]?.input;
    expect(secondInput).toEqual([
      { role: "user", content: [{ type: "input_text", text: "Find LLM Space" }] },
      ...RESPONSE_OUTPUT,
      {
        type: "function_call_output",
        call_id: "call_1",
        output: "lookup result",
      },
    ]);
    for (const type of [
      "web_search_call",
      "function_call",
      "message",
      "function_call_output",
    ]) {
      expect(
        (secondInput as { type?: string }[]).filter(
          (item) => item.type === type
        )
      ).toHaveLength(1);
    }
  });
});
