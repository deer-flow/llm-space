import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import type { AgentEvent, AgentTransport } from "@llm-space/core";

import { createThreadStore } from "../../../../src/components/thread-playground/stores/thread-store";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

beforeAll(() => {
  globalThis.requestAnimationFrame = (callback) =>
    Number(setTimeout(() => callback(performance.now()), 0));
  globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle);
});

afterAll(() => {
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
});

function _event(value: unknown): AgentEvent {
  return value as AgentEvent;
}

describe("auto-run tool results", () => {
  test("waits for generate_image before completing the run", async () => {
    const events = [
      _event({
        type: "message_start",
        message: { role: "assistant" },
      }),
      _event({
        type: "message_update",
        assistantMessageEvent: {
          type: "toolcall_start",
          contentIndex: 0,
          partial: {
            content: [
              {
                type: "toolCall",
                id: "tool-image",
                name: "generate_image",
                arguments: {},
              },
            ],
          },
        },
      }),
      _event({
        type: "message_update",
        assistantMessageEvent: {
          type: "toolcall_end",
          contentIndex: 0,
          toolCall: {
            type: "toolCall",
            id: "tool-image",
            name: "generate_image",
            arguments: { prompt: "A red circle" },
          },
        },
      }),
      _event({
        type: "message_end",
        message: { role: "assistant" },
      }),
    ];
    const transport: AgentTransport = async function* () {
      yield* events;
    };
    let resolveImage: (() => void) | undefined;
    const imageGate = new Promise<void>((resolve) => {
      resolveImage = resolve;
    });
    let markExecutionStarted: (() => void) | undefined;
    const executionStarted = new Promise<void>((resolve) => {
      markExecutionStarted = resolve;
    });
    const store = createThreadStore(
      {
        context: {
          messages: [
            {
              id: "user-1",
              role: "user",
              content: [{ type: "text", text: "Generate an image" }],
            },
          ],
          tools: [
            {
              type: "builtin",
              name: "generate_image",
              description: "Generate an image.",
              parameters: { type: "object", properties: {} },
            },
          ],
        },
      },
      {
        transport,
        resolveModel: () => ({ provider: "test", id: "test" }),
        getAutoRunTools: () => true,
        executeTool: async () => {
          markExecutionStarted?.();
          await imageGate;
          return {
            content: [
              { type: "image", data: "cG5nLWJ5dGVz", mimeType: "image/png" },
            ],
            isError: false,
          };
        },
      }
    );

    let runSettled = false;
    const run = store
      .getState()
      .run()
      .finally(() => {
        runSettled = true;
      });
    await executionStarted;
    await Promise.resolve();

    expect(runSettled).toBe(false);
    expect(store.getState().status).toBe("running");
    expect(store.getState().executingToolCallIds).toEqual(["tool-image"]);

    resolveImage?.();
    await run;

    expect(runSettled).toBe(true);
    expect(store.getState().status).toBe("idle");
    expect(store.getState().executingToolCallIds).toEqual([]);
  });

  test("preserves structured image content returned by a built-in tool", async () => {
    const events = [
      _event({
        type: "message_start",
        message: { role: "assistant" },
      }),
      _event({
        type: "message_update",
        assistantMessageEvent: {
          type: "toolcall_start",
          contentIndex: 0,
          partial: {
            content: [
              {
                type: "toolCall",
                id: "tool-1",
                name: "read",
                arguments: {},
              },
            ],
          },
        },
      }),
      _event({
        type: "message_update",
        assistantMessageEvent: {
          type: "toolcall_delta",
          contentIndex: 0,
          delta: '{"path":"/tmp/pixel.png"}',
        },
      }),
      _event({
        type: "message_update",
        assistantMessageEvent: {
          type: "toolcall_end",
          contentIndex: 0,
          toolCall: {
            type: "toolCall",
            id: "tool-1",
            name: "read",
            arguments: { path: "/tmp/pixel.png" },
          },
        },
      }),
      _event({
        type: "message_end",
        message: { role: "assistant" },
      }),
    ];
    const transport: AgentTransport = async function* () {
      yield* events;
    };
    const outputContent = [
      { type: "text" as const, text: "[image file: pixel.png]" },
      {
        type: "image" as const,
        data: "cG5nLWJ5dGVz",
        mimeType: "image/png",
      },
    ];
    const store = createThreadStore(
      {
        context: {
          messages: [
            {
              id: "user-1",
              role: "user",
              content: [{ type: "text", text: "Read the image" }],
            },
          ],
          tools: [
            {
              type: "builtin",
              name: "read",
              description: "Read a file.",
              parameters: { type: "object", properties: {} },
            },
          ],
        },
      },
      {
        transport,
        resolveModel: () => ({ provider: "test", id: "test" }),
        getAutoRunTools: () => true,
        executeTool: () =>
          Promise.resolve({
            content: outputContent,
            isError: false,
          }),
      }
    );

    await store.getState().run();

    const messages = store.getState().thread.context?.messages ?? [];
    const assistant = messages.at(-1);
    expect(assistant?.role).toBe("assistant");
    if (assistant?.role !== "assistant") {
      throw new Error("Expected an assistant message");
    }
    expect(assistant.toolCalls?.[0]?.output).toEqual({
      content: outputContent,
      isError: false,
    });
  });

  test("shares one owning Thread and variables snapshot across a Plugin Tool batch", async () => {
    const providerToolCalls = ["first_tool", "second_tool"].map(
      (name, index) => ({
        type: "toolCall" as const,
        id: `tool-${index}`,
        name,
        arguments: { index },
      })
    );
    const events = [
      _event({ type: "message_start", message: { role: "assistant" } }),
      ...providerToolCalls.flatMap((toolCall, index) => [
        _event({
          type: "message_update",
          assistantMessageEvent: {
            type: "toolcall_start",
            contentIndex: index,
            partial: {
              content: providerToolCalls,
            },
          },
        }),
        _event({
          type: "message_update",
          assistantMessageEvent: {
            type: "toolcall_delta",
            contentIndex: index,
            delta: JSON.stringify(toolCall.arguments),
          },
        }),
        _event({
          type: "message_update",
          assistantMessageEvent: {
            type: "toolcall_end",
            contentIndex: index,
            toolCall,
          },
        }),
      ]),
      _event({ type: "message_end", message: { role: "assistant" } }),
    ];
    const transport: AgentTransport = async function* () {
      yield* events;
    };
    const contexts: unknown[] = [];
    const store = createThreadStore(
      {
        title: "Owning thread",
        context: {
          variables: {
            current_working_directory: {
              type: "workingDirectory",
              value: "/workspace",
            },
          },
          messages: [
            {
              id: "user-1",
              role: "user",
              content: [{ type: "text", text: "Call both tools" }],
            },
          ],
          tools: ["first_tool", "second_tool"].map((name) => ({
            type: "plugin" as const,
            pluginId: "fixture",
            toolId: `plugin:fixture:tool:${name}`,
            name,
            description: name,
            parameters: { type: "object", properties: {} },
          })),
        },
      },
      {
        transport,
        resolveModel: () => ({ provider: "test", id: "test" }),
        getAutoRunTools: () => true,
        executeTool: (_tool, _args, context) => {
          contexts.push(context);
          return Promise.resolve({
            content: [{ type: "text", text: "ok" }],
            isError: false,
          });
        },
      }
    );

    await store.getState().run();

    expect(contexts).toHaveLength(2);
    expect(contexts[0]).toBe(contexts[1]);
    expect(contexts[0]).toMatchObject({
      thread: { title: "Owning thread" },
      variables: { current_working_directory: "/workspace" },
    });
  });
});
