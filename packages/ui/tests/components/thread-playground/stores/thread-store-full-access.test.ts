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

/** A turn that calls the built-in bash tool with a destructive command. */
function destructiveBashTransport(): AgentTransport {
  return async function* () {
    yield _event({
      type: "message_start",
      message: { role: "assistant" },
    });
    yield _event({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_start",
        contentIndex: 0,
        partial: {
          content: [
            {
              type: "toolCall",
              id: "tool-bash",
              name: "bash",
              arguments: {},
            },
          ],
        },
      },
    });
    yield _event({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_delta",
        contentIndex: 0,
        delta: JSON.stringify({ command: "rm -rf /tmp/some-dir" }),
      },
    });
    yield _event({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_end",
        contentIndex: 0,
        toolCall: {
          type: "toolCall",
          id: "tool-bash",
          name: "bash",
          arguments: { command: "rm -rf /tmp/some-dir" },
        },
      },
    });
    yield _event({ type: "message_end", message: { role: "assistant" } });
  };
}

const bashToolThread = {
  context: {
    messages: [
      {
        id: "user-1",
        role: "user" as const,
        content: [{ type: "text" as const, text: "Clean that up" }],
      },
    ],
    tools: [
      {
        type: "builtin" as const,
        name: "bash",
        description: "Run a shell command.",
        parameters: { type: "object" as const, properties: {} },
      },
    ],
  },
};

describe("full access mode", () => {
  test("pauses on a destructive bash command when disabled (default)", async () => {
    let executed = 0;
    const store = createThreadStore(bashToolThread, {
      transport: destructiveBashTransport(),
      resolveModel: () => ({ provider: "test", id: "test" }),
      getAutoRunTools: () => true,
      getFullAccessMode: () => false,
      executeTool: async () => {
        executed += 1;
        return { content: [{ type: "text", text: "ran" }], isError: false };
      },
    });

    await store.getState().run();

    expect(executed).toBe(0);
    expect(store.getState().status).toBe("idle");
    const last = store.getState().thread.context?.messages?.at(-1);
    expect(last?.role).toBe("assistant");
    if (last?.role === "assistant") {
      // toolcall_end leaves an empty placeholder; no executed result text.
      expect(last.toolCalls?.[0]?.output?.content).toEqual([
        { type: "text", text: "" },
      ]);
    }
  });

  test("auto-executes a destructive bash command when enabled", async () => {
    let executed = 0;
    const store = createThreadStore(bashToolThread, {
      transport: destructiveBashTransport(),
      resolveModel: () => ({ provider: "test", id: "test" }),
      getAutoRunTools: () => true,
      getFullAccessMode: () => true,
      executeTool: async () => {
        executed += 1;
        return { content: [{ type: "text", text: "ran" }], isError: false };
      },
    });

    await store.getState().run();

    expect(executed).toBe(1);
    expect(store.getState().status).toBe("idle");
    const last = store.getState().thread.context?.messages?.at(-1);
    expect(last?.role).toBe("assistant");
    if (last?.role === "assistant") {
      expect(last.toolCalls?.[0]?.output?.content).toEqual([
        { type: "text", text: "ran" },
      ]);
    }
  });
});
