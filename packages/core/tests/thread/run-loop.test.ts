import { describe, expect, test } from "bun:test";

import type { AgentEvent } from "@earendil-works/pi-agent-core";

import {
  type ExecuteThreadTool,
  resolveThreadRunPolicy,
  runThreadLoop,
  runThreadWithInput,
} from "../../src/thread";
import type {
  BuiltinTool,
  Message,
  Thread,
  ThreadContext,
} from "../../src/types";

function _event(value: unknown): AgentEvent {
  return value as AgentEvent;
}

function _textTurn(text: string): AgentEvent[] {
  return [
    _event({ type: "message_start", message: { role: "assistant" } }),
    _event({
      type: "message_update",
      assistantMessageEvent: { type: "text_start", contentIndex: 0 },
    }),
    _event({
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        contentIndex: 0,
        delta: text,
      },
    }),
    _event({ type: "message_end", message: { role: "assistant" } }),
  ];
}

function _toolTurn(name: string, args: Record<string, unknown>): AgentEvent[] {
  const encoded = JSON.stringify(args);
  return [
    _event({ type: "message_start", message: { role: "assistant" } }),
    _event({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_start",
        contentIndex: 0,
        partial: {
          content: [{ type: "toolCall", id: "call-1", name, arguments: {} }],
        },
      },
    }),
    _event({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_delta",
        contentIndex: 0,
        delta: encoded,
      },
    }),
    _event({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_end",
        contentIndex: 0,
        toolCall: { type: "toolCall", id: "call-1", name, arguments: args },
      },
    }),
    _event({ type: "message_end", message: { role: "assistant" } }),
  ];
}

function _stepByStepToolTurn(
  name: string,
  args: Record<string, unknown>
): AgentEvent[] {
  return [
    ..._toolTurn(name, args),
    _event({
      type: "tool_execution_start",
      toolCallId: "call-1",
      toolName: name,
      args,
    }),
    _event({
      type: "tool_execution_end",
      toolCallId: "call-1",
      toolName: name,
      result: {
        terminate: true,
        content: [{ type: "text", text: "" }],
      },
      isError: false,
    }),
    _event({
      type: "message_start",
      message: {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: name,
        content: [{ type: "text", text: "" }],
      },
    }),
    _event({
      type: "message_end",
      message: {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: name,
        content: [{ type: "text", text: "" }],
      },
    }),
  ];
}

function _readTool(): BuiltinTool {
  return {
    type: "builtin",
    name: "read",
    description: "Read a file.",
    parameters: { type: "object", properties: {} },
  };
}

function _bashTool(): BuiltinTool {
  return {
    type: "builtin",
    name: "bash",
    description: "Run a command.",
    parameters: { type: "object", properties: {} },
  };
}

function _thread(tools: BuiltinTool[] = [], extra?: Message[]): Thread {
  return {
    context: {
      tools,
      messages: [
        {
          id: "user-1",
          role: "user",
          content: [{ type: "text", text: "Go" }],
        },
        ...(extra ?? []),
      ],
    },
  };
}

function _scriptedStream(
  turns: AgentEvent[][]
): (context: ThreadContext) => AsyncIterable<AgentEvent> {
  let index = 0;
  return async function* () {
    const events = turns[index] ?? [];
    index += 1;
    yield* events;
  };
}

async function _collect(
  thread: Thread,
  options: {
    turns: AgentEvent[][];
    policy?: { autoRunTools?: boolean; reactLoop?: boolean; maxTurns?: number };
    executeTool?: ExecuteThreadTool;
    onPause?: "pause" | "fail";
    signal?: AbortSignal;
  }
) {
  const events = [];
  for await (const event of runThreadLoop({
    thread,
    messages: thread.context?.messages ?? [],
    policy: options.policy,
    streamTurn: _scriptedStream(options.turns),
    executeTool: options.executeTool,
    onPause: options.onPause,
    signal: options.signal,
  })) {
    events.push(event);
  }
  return events;
}

describe("resolveThreadRunPolicy", () => {
  test("forces auto-run when the ReAct loop is on", () => {
    expect(resolveThreadRunPolicy({ reactLoop: true })).toEqual({
      autoRunTools: true,
      reactLoop: true,
      maxTurns: 50,
    });
  });

  test("keeps a custom maxTurns and defaults the rest", () => {
    expect(resolveThreadRunPolicy({ maxTurns: 3 })).toEqual({
      autoRunTools: false,
      reactLoop: false,
      maxTurns: 3,
    });
    expect(resolveThreadRunPolicy({ maxTurns: 0 }).maxTurns).toBe(50);
  });
});

describe("runThreadLoop", () => {
  test("runs a single model turn when tools are not auto-run", async () => {
    const events = await _collect(_thread(), {
      turns: [_textTurn("Hello")],
    });
    const end = events.at(-1);
    expect(end).toMatchObject({
      type: "run_end",
      reason: "completed",
      policy: { autoRunTools: false, reactLoop: false, maxTurns: 50 },
    });
    if (end?.type !== "run_end") {
      throw new Error("Expected run_end");
    }
    expect(end.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "Hello" }],
    });
  });

  test("auto-runs tools once and stops without ReAct", async () => {
    const calls: string[] = [];
    const events = await _collect(_thread([_readTool()]), {
      turns: [_toolTurn("read", { path: "/tmp/a.txt" }), _textTurn("done")],
      policy: { autoRunTools: true },
      executeTool: (_tool, args) => {
        calls.push(String(args.path));
        return Promise.resolve({
          content: [{ type: "text", text: "file" }],
          isError: false,
        });
      },
    });
    expect(calls).toEqual(["/tmp/a.txt"]);
    expect(events.map((event) => event.type)).toEqual([
      "agent_event",
      "agent_event",
      "agent_event",
      "agent_event",
      "agent_event",
      "tool_start",
      "tool_result",
      "run_end",
    ]);
    const end = events.at(-1);
    expect(end).toMatchObject({ type: "run_end", reason: "completed" });
    if (end?.type !== "run_end") {
      throw new Error("Expected run_end");
    }
    expect(end.messages).toHaveLength(2);
    const assistant = end.messages.at(-1);
    expect(assistant?.role).toBe("assistant");
    if (assistant?.role !== "assistant") {
      throw new Error("Expected assistant");
    }
    expect(assistant.toolCalls?.[0]?.output).toEqual({
      content: [{ type: "text", text: "file" }],
      isError: false,
    });
  });

  test("keeps step-by-step placeholder execution events inside the model turn", async () => {
    const calls: string[] = [];
    const events = await _collect(_thread([_readTool()]), {
      turns: [
        _stepByStepToolTurn("read", { path: "/tmp/a.txt" }),
        _textTurn("done"),
      ],
      policy: { reactLoop: true },
      executeTool: (_tool, args) => {
        calls.push(String(args.path));
        return Promise.resolve({
          content: [{ type: "text", text: "real tool result" }],
          isError: false,
        });
      },
    });

    expect(calls).toEqual(["/tmp/a.txt"]);
    expect(
      events
        .filter((event) => event.type === "agent_event")
        .map((event) => event.event.type)
    ).not.toContain("tool_execution_end");
    expect(
      events
        .filter((event) => event.type === "agent_event")
        .some(
          (event) =>
            (event.event.type === "message_start" ||
              event.event.type === "message_end") &&
            event.event.message.role === "toolResult"
        )
    ).toBe(false);
    expect(events).toContainEqual({
      type: "tool_result",
      toolCallId: "call-1",
      content: [{ type: "text", text: "real tool result" }],
      isError: false,
    });
    expect(events.at(-1)).toMatchObject({
      type: "run_end",
      reason: "completed",
    });
  });

  test("ReAct continues until the model stops calling tools", async () => {
    const events = await _collect(_thread([_readTool()]), {
      turns: [
        _toolTurn("read", { path: "/tmp/a.txt" }),
        _textTurn("Finished"),
      ],
      policy: { reactLoop: true },
      executeTool: () =>
        Promise.resolve({
          content: [{ type: "text", text: "file" }],
          isError: false,
        }),
    });
    const end = events.at(-1);
    expect(end).toMatchObject({ type: "run_end", reason: "completed" });
    if (end?.type !== "run_end") {
      throw new Error("Expected run_end");
    }
    expect(end.messages).toHaveLength(3);
    expect(end.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "Finished" }],
    });
    expect(end.policy).toMatchObject({ autoRunTools: true, reactLoop: true });
  });

  test("stops at maxTurns during a ReAct loop", async () => {
    const events = await _collect(_thread([_readTool()]), {
      turns: [
        _toolTurn("read", { path: "/tmp/a.txt" }),
        _toolTurn("read", { path: "/tmp/a.txt" }),
        _toolTurn("read", { path: "/tmp/a.txt" }),
      ],
      policy: { reactLoop: true, maxTurns: 2 },
      executeTool: () =>
        Promise.resolve({
          content: [{ type: "text", text: "file" }],
          isError: false,
        }),
    });
    expect(events.at(-1)).toMatchObject({
      type: "run_end",
      reason: "max_turns",
    });
  });

  test("aborts mid-turn", async () => {
    const abort = new AbortController();
    const streamTurn = async function* () {
      yield* _textTurn("Hel");
      abort.abort();
      yield* _textTurn("lo");
    };
    const events = [];
    for await (const event of runThreadLoop({
      thread: _thread(),
      messages: _thread().context?.messages ?? [],
      streamTurn,
      signal: abort.signal,
    })) {
      events.push(event);
    }
    expect(events.at(-1)).toMatchObject({
      type: "run_end",
      reason: "aborted",
    });
  });

  test("pauses dangerous bash in the editor and fails headless", async () => {
    const paused = await _collect(_thread([_bashTool()]), {
      turns: [_toolTurn("bash", { command: "rm -rf /" })],
      policy: { autoRunTools: true },
      executeTool: () => {
        throw new Error("should not execute");
      },
      onPause: "pause",
    });
    expect(paused.map((event) => event.type)).toContain("paused");
    expect(paused.at(-1)).toMatchObject({
      type: "run_end",
      reason: "paused",
    });

    const failed = await _collect(_thread([_bashTool()]), {
      turns: [_toolTurn("bash", { command: "rm -rf /" })],
      policy: { autoRunTools: true },
      executeTool: () => {
        throw new Error("should not execute");
      },
      onPause: "fail",
    });
    expect(failed.at(-1)).toMatchObject({
      type: "run_end",
      reason: "failed",
    });
  });
});

describe("runThreadWithInput", () => {
  test("appends one input and completes with a fake model", async () => {
    const result = await runThreadWithInput({
      thread: { context: { tools: [] } },
      input: "What is 1+1?",
      streamTurn: _scriptedStream([_textTurn("2")]),
    });
    expect(result.reason).toBe("completed");
    expect(result.messages[0]).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "What is 1+1?" }],
    });
    expect(result.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "2" }],
    });
    expect(result.thread.context?.messages).toEqual(result.messages);
  });
});
