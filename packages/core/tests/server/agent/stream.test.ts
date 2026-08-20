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

import { createAgentStatusRuntime } from "../../../src/agent-status";
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

function _messageText(message: Context["messages"][number]): string {
  if (message.role !== "user") return "";
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
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
        messages: [{ role: "user", content: "Hello", timestamp: Date.now() }],
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
        messages: [{ role: "user", content: "Hello", timestamp: Date.now() }],
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
        messages: [{ role: "user", content: "Hello", timestamp: Date.now() }],
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

describe("streamAgent Agent Status provider context", () => {
  test("keeps the cached prefix unchanged and sends one trailing status user message", async () => {
    const now = Date.UTC(2026, 7, 19, 6, 10, 20, 123);
    const systemPrompt =
      "Keep this system prompt byte-for-byte stable.\r\nCache boundary.";
    const originalMessages: Context["messages"] = [
      {
        role: "user",
        content: [{ type: "text", text: "Help me inspect this project." }],
        timestamp: now - 10_000,
      },
      {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "read-1",
            name: "read_file",
            arguments: { path: "README.md" },
          },
        ],
        api: "openai-completions",
        provider: "test",
        model: "test-model",
        stopReason: "toolUse",
        timestamp: now - 8_000,
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
      },
      {
        role: "toolResult",
        toolCallId: "read-1",
        toolName: "read_file",
        content: [{ type: "text", text: "Project contents" }],
        isError: false,
        timestamp: now - 6_000,
      },
      {
        role: "user",
        content: [{ type: "text", text: "Please continue." }],
        timestamp: now - 2_000,
      },
    ];
    const originalSnapshot = structuredClone(originalMessages);
    const runtime = createAgentStatusRuntime({
      now: () => now,
      environment: {
        currentTime: new Date(now).toISOString(),
        workingDirectory: "C:\\repo",
        platform: "win32",
        arch: "x64",
        shell: "PowerShell 7",
        pythonVersion: "Python 3.12.4",
      },
    });
    const prepared = await runtime.prepareContext({
      systemPrompt,
      messages: originalMessages,
      tools: [],
      responseApiNativeTools: [],
      agentStatus: {
        components: ["timestamps", "tool-counter", "system"],
        workingDirectory: "C:\\repo",
        toolCallMetadata: {
          "read-1": { timestamp: now - 6_000, ordinal: 1 },
        },
      },
    });
    const model: Model<"openai-completions"> = {
      id: "test-model",
      name: "Test model",
      api: "openai-completions",
      provider: "test",
      baseUrl: "https://example.invalid/v1",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 16_384,
    };
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = (async (input, init) => {
      requestBody = await _requestBody(input, init);
      return _chatCompletionsResponse();
    }) as typeof fetch;
    let providerContext: Context | undefined;
    const models = {
      getModel: () => model as Model<Api>,
      streamSimple: (
        _model: Model<Api>,
        context: Context,
        options?: SimpleStreamOptions
      ) => {
        providerContext = structuredClone(context);
        return streamOpenAICompletions(model, context, options);
      },
    } as unknown as Models;

    for await (const event of streamAgent(
      {
        model: { provider: model.provider, id: model.id },
        context: prepared,
      },
      {
        models,
        signal: new AbortController().signal,
        getApiKey: () => "test-key",
      }
    )) {
      void event;
    }

    expect(providerContext).toBeDefined();
    expect(providerContext?.systemPrompt).toBe(systemPrompt);
    expect(originalMessages).toEqual(originalSnapshot);
    expect(providerContext?.messages).toHaveLength(originalMessages.length + 1);
    expect(providerContext?.messages.slice(0, -1)).toEqual(originalMessages);

    const statusMessages = (providerContext?.messages ?? []).filter(
      (message) =>
        message.role === "user" &&
        /^<agent_status>\n[\s\S]*\n<\/agent_status>$/u.test(
          _messageText(message)
        )
    );
    expect(statusMessages).toHaveLength(1);
    expect(providerContext?.messages.at(-1)).toEqual(statusMessages[0]);

    const rawMessages = requestBody?.messages;
    if (!Array.isArray(rawMessages)) {
      throw new Error("OpenAI Completions 请求体缺少 messages 数组。");
    }
    expect(rawMessages[0]).toEqual({ role: "system", content: systemPrompt });
    expect(rawMessages.at(-2)).toMatchObject({ role: "user" });
    expect(rawMessages.at(-1)).toMatchObject({ role: "user" });
    expect(
      rawMessages.filter((message) =>
        JSON.stringify(message).includes("<agent_status>")
      )
    ).toHaveLength(1);
    expect(JSON.stringify(rawMessages.at(-1))).toContain("<agent_status>");
    expect(JSON.stringify(rawMessages.at(-1))).toContain("</agent_status>");
    expect(JSON.stringify(requestBody)).not.toContain("__llmSpaceAgentStatus");
  });
});
