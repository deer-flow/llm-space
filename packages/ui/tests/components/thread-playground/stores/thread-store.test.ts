import { describe, expect, test } from "bun:test";

import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type {
  AgentStreamRequest,
  AgentTransport,
  ProviderHostedTool,
  Thread,
} from "@llm-space/core";

import { createThreadStore } from "../../../../src/components/thread-playground/stores";

globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number =>
  setTimeout(() => callback(performance.now()), 0) as unknown as number;
globalThis.cancelAnimationFrame = (handle: number): void => {
  clearTimeout(handle);
};

const INVALID_THREAD: Thread = {
  context: {
    messages: [
      {
        content: [{ text: "Question", type: "text" }],
        id: "user-one",
        role: "user",
      },
      {
        content: [{ text: "Answer", type: "text" }],
        id: "assistant-one",
        role: "assistant",
      },
    ],
  },
  model: { id: "model", provider: "fake" },
};

describe("working-directory normalization", () => {
  test("stores an absolute path and invalidates legacy frozen values", async () => {
    const store = createThreadStore(
      {
        context: {
          variables: {
            current_working_directory: {
              type: "workingDirectory",
              value: "~/Desktop/llm-space-project",
            },
          },
          snapshot: {
            variables: {
              systemPrompt: {
                current_working_directory: "~/Desktop/llm-space-project",
              },
            },
          },
        },
      },
      {
        resolvePath: (value) =>
          Promise.resolve(value.replace("~", "/Users/tester")),
      }
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      store.getState().thread.context?.variables?.current_working_directory
    ).toEqual({
      type: "workingDirectory",
      value: "/Users/tester/Desktop/llm-space-project",
    });
    expect(
      store.getState().thread.context?.snapshot?.variables?.systemPrompt
        ?.current_working_directory
    ).toBeUndefined();
  });
});

describe("inline run validation", () => {
  test("scopes feedback to the blocking message", async () => {
    let transportCalls = 0;
    const store = createThreadStore(INVALID_THREAD, {
      resolveModel: (saved) => saved ?? null,
      transport: () => {
        transportCalls += 1;
        throw new Error("Transport should not run for invalid input");
      },
    });

    await store.getState().run();

    expect(store.getState().runValidationIssue).toMatchObject({
      code: "lastAssistantMessage",
      level: "warning",
      messageId: "assistant-one",
      resolution: { type: "appendUserMessage" },
    });
    expect(transportCalls).toBe(0);

    store.getState().updateMessageTextContent("assistant-one", "Edited answer");
    expect(store.getState().runValidationIssue?.messageId).toBe(
      "assistant-one"
    );

    store.getState().resolveRunValidationIssue();
    const messages = store.getState().thread.context?.messages ?? [];
    expect(store.getState().runValidationIssue).toBeNull();
    expect(messages.at(-1)?.role).toBe("user");
    expect(store.getState().autoFocusMessageId).toBe(
      messages.at(-1)?.id ?? null
    );
  });

  test("clears feedback when the blocking role becomes runnable", async () => {
    const store = createThreadStore(INVALID_THREAD, {
      resolveModel: (saved) => saved ?? null,
      transport: () => {
        throw new Error("Transport should not run for invalid input");
      },
    });

    await store.getState().run();
    store.getState().toggleMessageRole("assistant-one");

    expect(store.getState().runValidationIssue).toBeNull();
  });
});

describe("provider-hosted tools", () => {
  const providerHostedTool: ProviderHostedTool = {
    type: "provider-hosted",
    config: { type: "web_search", search_context_size: "high" },
  };

  test("uses provider-hosted identity for add, duplicate, update, and removal", () => {
    const store = createThreadStore({});

    expect(store.getState().addTool(providerHostedTool)).toBe(true);
    expect(store.getState().addTool(providerHostedTool)).toBe(false);
    expect(
      store.getState().addTool({
        type: "function",
        name: "web_search",
        description: "Client function",
        parameters: { type: "object" },
      })
    ).toBe(true);
    expect(
      store.getState().updateTool("provider-hosted:web_search", {
        type: "provider-hosted",
        config: { type: "file_search", vector_store_ids: ["vs_1"] },
      })
    ).toBe(true);

    expect(store.getState().thread.context?.tools).toHaveLength(2);
    store.getState().removeTool("provider-hosted:file_search");
    expect(store.getState().thread.context?.tools).toEqual([
      expect.objectContaining({ type: "function", name: "web_search" }),
    ]);
  });

  test("forwards provider-hosted config and retains an activity-only final message", async () => {
    let capturedRequest: AgentStreamRequest | undefined;
    const finalAssistant = {
        role: "assistant",
        content: [],
        nativeToolActivities: [
          {
            id: "ws_1",
            type: "web_search_call",
            status: "completed",
            raw: { id: "ws_1", type: "web_search_call" },
          },
        ],
        responseOutputItems: [{ id: "ws_1", type: "web_search_call" }],
        api: "openai-responses",
        provider: "openai",
        model: "gpt-test",
        usage: {
          input: 1,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 1,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: Date.now(),
      } as const;
    const events = [
      {
        type: "message_start",
        message: finalAssistant,
      } as unknown as AgentEvent,
      {
        type: "message_end",
        message: finalAssistant,
      } as unknown as AgentEvent,
    ];
    const transport: AgentTransport = async function* (request) {
      capturedRequest = request;
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      yield* events;
    };
    const store = createThreadStore(
      {
        model: { id: "gpt-test", provider: "openai" },
        context: {
          tools: [providerHostedTool],
          messages: [
            {
              id: "user-1",
              role: "user",
              content: [{ type: "text", text: "Search" }],
            },
          ],
        },
      },
      {
        resolveModel: (saved) => saved ?? null,
        transport,
      }
    );

    await store.getState().run();

    expect(capturedRequest?.context.responseApiNativeTools).toEqual([
      providerHostedTool.config,
    ]);
    const assistant = store.getState().thread.context?.messages?.at(-1);
    expect(assistant?.role).toBe("assistant");
    if (assistant?.role !== "assistant") throw new Error("Expected assistant");
    expect(assistant.providerHostedToolActivities).toHaveLength(1);
    expect(assistant.responseOutputItems).toHaveLength(1);
  });
});
