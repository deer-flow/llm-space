import { afterEach, describe, expect, test } from "bun:test";

import type {
  Api,
  AssistantMessage,
  AssistantMessageEventStream,
  Context,
  Model,
  Models,
  SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { streamSimple as streamOpenAICompletions } from "@earendil-works/pi-ai/api/openai-completions";

import { streamAgent } from "../../../src/server/agent/stream";
import type { AgentStreamRequest } from "../../../src/types/agent";


const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

function _chatCompletionsResponse(): Response {
  const chunks = [
    {
      id: "chatcmpl_1",
      object: "chat.completion.chunk",
      created: 0,
      model: "completion-only",
      choices: [
        {
          index: 0,
          delta: { role: "assistant", content: "Done" },
          finish_reason: null,
        },
      ],
    },
    {
      id: "chatcmpl_1",
      object: "chat.completion.chunk",
      created: 0,
      model: "completion-only",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    },
  ];
  const body = `${chunks
    .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
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

function _completedStream(
  model: Model<Api>,
  beforeDone: () => Promise<void>
): AssistantMessageEventStream {
  const message: AssistantMessage = {
    role: "assistant",
    content: [{ type: "text", text: "Done" }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
  return {
    async *[Symbol.asyncIterator]() {
      await beforeDone();
      yield { type: "done", reason: "stop", message } as const;
    },
    result: () => Promise.resolve(message),
  } as unknown as AssistantMessageEventStream;
}

describe("streamAgent Responses native tool forwarding", () => {
  test("forwards native tools without gating on the model API", async () => {
    let streamCalls = 0;
    let receivedPayload: Record<string, unknown> | undefined;
    const model: Model<"openai-completions"> = {
      id: "completion-only",
      name: "Completion only",
      api: "openai-completions",
      provider: "openai",
      baseUrl: "https://example.invalid/v1",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 16_384,
    };
    const models = {
      getModel: () => model as Model<Api>,
      streamSimple: (
        _model: Model<Api>,
        _context: Context,
        options?: SimpleStreamOptions
      ) => {
        streamCalls += 1;
        return _completedStream(model, async () => {
            const payload = {
              tools: [{ type: "function", name: "lookup" }],
            };
            receivedPayload = ((await options?.onPayload?.(payload, model)) ??
              payload) as Record<string, unknown>;
        });
      },
    } as unknown as Models;
    const request: AgentStreamRequest = {
      model: { provider: "openai", id: model.id },
      context: {
        messages: [
          { role: "user", content: "Hello", timestamp: Date.now() },
        ],
        tools: [],
        responseApiNativeTools: [{ type: "web_search" }],
      },
    };

    let eventCount = 0;
    for await (const _event of streamAgent(request, {
      models,
      signal: new AbortController().signal,
    })) {
      void _event;
      eventCount += 1;
    }
    expect(eventCount).toBeGreaterThan(0);
    expect(streamCalls).toBe(1);
    expect(receivedPayload?.tools).toEqual([
      { type: "function", name: "lookup" },
      { type: "web_search" },
    ]);
  });

  test("appends native tools at the Google payload tool path", async () => {
    let receivedPayload: Record<string, unknown> | undefined;
    const model: Model<"google-generative-ai"> = {
      id: "gemini-compatible",
      name: "Gemini compatible",
      api: "google-generative-ai",
      provider: "google",
      baseUrl: "https://example.invalid",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 16_384,
    };
    const models = {
      getModel: () => model as Model<Api>,
      streamSimple: (
        _model: Model<Api>,
        _context: Context,
        options?: SimpleStreamOptions
      ) =>
        _completedStream(model, async () => {
          const payload = {
            config: { tools: [{ functionDeclarations: [] }] },
          };
          receivedPayload = ((await options?.onPayload?.(payload, model)) ??
            payload) as Record<string, unknown>;
        }),
    } as unknown as Models;
    const request: AgentStreamRequest = {
      model: { provider: model.provider, id: model.id },
      context: {
        messages: [
          { role: "user", content: "Hello", timestamp: Date.now() },
        ],
        tools: [],
        responseApiNativeTools: [{ type: "web_search" }],
      },
    };

    for await (const event of streamAgent(request, {
      models,
      signal: new AbortController().signal,
    })) {
      void event;
    }

    expect(receivedPayload?.tools).toBeUndefined();
    expect(
      (receivedPayload?.config as Record<string, unknown> | undefined)?.tools
    ).toEqual([{ functionDeclarations: [] }, { type: "web_search" }]);
  });

  test("injects native tools into a real Completions request payload", async () => {
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = (async (input, init) => {
      requestBody = await _requestBody(input, init);
      return _chatCompletionsResponse();
    }) as typeof fetch;
    const model: Model<"openai-completions"> = {
      id: "completion-only",
      name: "Completion only",
      api: "openai-completions",
      provider: "openai",
      baseUrl: "https://example.invalid/v1",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 16_384,
    };
    const models = {
      getModel: () => model as Model<Api>,
      streamSimple: (
        _model: Model<Api>,
        context: Context,
        options?: SimpleStreamOptions
      ) => streamOpenAICompletions(model, context, options),
    } as unknown as Models;
    const request: AgentStreamRequest = {
      model: { provider: model.provider, id: model.id },
      context: {
        messages: [
          { role: "user", content: "Hello", timestamp: Date.now() },
        ],
        tools: [
          {
            name: "lookup",
            description: "Look up a topic",
            parameters: { type: "object", properties: {} },
          },
        ],
        responseApiNativeTools: [{ type: "web_search" }],
      },
    };

    for await (const event of streamAgent(request, {
      models,
      signal: new AbortController().signal,
      getApiKey: () => "test-key",
    })) {
      void event;
    }

    expect(requestBody?.tools).toEqual([
      {
        type: "function",
        function: {
          name: "lookup",
          description: "Look up a topic",
          parameters: { type: "object", properties: {} },
          strict: false,
        },
      },
      { type: "web_search" },
    ]);
  });
});
