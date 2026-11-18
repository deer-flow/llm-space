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

/** A turn that calls a Plugin Tool and a destructive bash command together. */
function riskyBatchTransport(): AgentTransport {
  const toolCalls = [
    {
      type: "toolCall" as const,
      id: "tool-plugin",
      name: "lookup",
      arguments: { query: "anything" },
    },
    {
      type: "toolCall" as const,
      id: "tool-bash",
      name: "bash",
      arguments: { command: "rm -rf /tmp/some-dir" },
    },
  ];
  const events = [
    _event({ type: "message_start", message: { role: "assistant" } }),
    ...toolCalls.flatMap((toolCall, index) => [
      _event({
        type: "message_update",
        assistantMessageEvent: {
          type: "toolcall_start",
          contentIndex: index,
          partial: { content: toolCalls },
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
  return async function* () {
    yield* events;
  };
}

const pluginAndBashToolThread = {
  context: {
    // A skills variable makes the Plugin Tool batch resolve prompt variables
    // through the injected loaders, i.e. across a real `await`.
    variables: {
      skills: {
        type: "skills" as const,
        skillNames: [],
        format: "xml" as const,
        indent: 0,
      },
    },
    messages: [
      {
        id: "user-1",
        role: "user" as const,
        content: [{ type: "text" as const, text: "Clean that up" }],
      },
    ],
    tools: [
      {
        type: "plugin" as const,
        pluginId: "fixture",
        toolId: "plugin:fixture:tool:lookup",
        name: "lookup",
        description: "Look something up.",
        parameters: { type: "object" as const, properties: {} },
      },
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

  test("pauses a destructive bash command when the mode is switched off mid-batch", async () => {
    let fullAccessEnabled = true;
    let executed = 0;
    let notifyBatchPreparation: (() => void) | undefined;
    const batchPreparationStarted = new Promise<void>((resolve) => {
      notifyBatchPreparation = resolve;
    });
    let releaseBatchPreparation: (() => void) | undefined;
    const batchPreparationGate = new Promise<void>((resolve) => {
      releaseBatchPreparation = resolve;
    });
    const store = createThreadStore(pluginAndBashToolThread, {
      transport: riskyBatchTransport(),
      resolveModel: () => ({ provider: "test", id: "test" }),
      getAutoRunTools: () => true,
      getFullAccessMode: () => fullAccessEnabled,
      loadSkills: async () => {
        // Only the pending-tool-call batch prepares while a trailing assistant
        // message still has unexecuted tool calls; the run's own prompt
        // rendering happens before any assistant message exists. Gating here
        // therefore suspends the batch exactly where a user could flip the
        // switch, instead of short-circuiting an earlier preparation step.
        const last = store.getState().thread.context?.messages?.at(-1);
        if (last?.role !== "assistant" || !(last.toolCalls?.length ?? 0)) {
          return [];
        }
        notifyBatchPreparation?.();
        await batchPreparationGate;
        return [];
      },
      executeTool: async () => {
        executed += 1;
        return { content: [{ type: "text", text: "ran" }], isError: false };
      },
    });

    const run = store.getState().run();
    await batchPreparationStarted;
    // The user switches the mode off while the batch is still preparing.
    fullAccessEnabled = false;
    releaseBatchPreparation?.();
    await run;

    // Nothing in the batch may run: the risky command must not be executed on
    // the full-access reading taken before the asynchronous preparation.
    expect(executed).toBe(0);
    expect(store.getState().status).toBe("idle");
    const last = store.getState().thread.context?.messages?.at(-1);
    expect(last?.role).toBe("assistant");
    if (last?.role === "assistant") {
      expect(
        last.toolCalls?.map((toolCall) => toolCall.output?.content)
      ).toEqual([[{ type: "text", text: "" }], [{ type: "text", text: "" }]]);
    }
  });

  test("still auto-executes the batch when the mode stays on across the preparation", async () => {
    let executed = 0;
    const store = createThreadStore(pluginAndBashToolThread, {
      transport: riskyBatchTransport(),
      resolveModel: () => ({ provider: "test", id: "test" }),
      getAutoRunTools: () => true,
      getFullAccessMode: () => true,
      loadSkills: async () => [],
      executeTool: async () => {
        executed += 1;
        return { content: [{ type: "text", text: "ran" }], isError: false };
      },
    });

    await store.getState().run();

    // The re-check after the preparation must not turn the opt-out into a
    // blanket refusal of every Plugin Tool batch.
    expect(executed).toBe(2);
    const last = store.getState().thread.context?.messages?.at(-1);
    expect(last?.role).toBe("assistant");
    if (last?.role === "assistant") {
      expect(
        last.toolCalls?.map((toolCall) => toolCall.output?.content)
      ).toEqual([
        [{ type: "text", text: "ran" }],
        [{ type: "text", text: "ran" }],
      ]);
    }
  });
});
