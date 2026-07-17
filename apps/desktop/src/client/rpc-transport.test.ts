import type { AgentEvent, AgentStreamRequest } from "@llm-space/core";
import { beforeEach, describe, expect, mock, test } from "bun:test";

import type {
  AbortStreamThreadPayload,
  StreamThreadRequestPayload,
  StreamThreadResponsePayload,
} from "@/shared/rpc";

type ResponseListener = (message: StreamThreadResponsePayload) => void;

class ControllableRpc {
  readonly aborts: AbortStreamThreadPayload[] = [];
  readonly starts: StreamThreadRequestPayload[] = [];
  private readonly _listeners = new Set<ResponseListener>();

  readonly send = {
    abortStreamThread: (payload: AbortStreamThreadPayload) => {
      this.aborts.push(payload);
    },
    sendStreamThreadRequest: (payload: StreamThreadRequestPayload) => {
      this.starts.push(payload);
    },
  };

  addMessageListener(
    message: "receiveStreamThreadResponse",
    listener: ResponseListener
  ) {
    expect(message).toBe("receiveStreamThreadResponse");
    this._listeners.add(listener);
  }

  emit(message: StreamThreadResponsePayload) {
    for (const listener of [...this._listeners]) {
      listener(message);
    }
  }

  get listenerCount() {
    return this._listeners.size;
  }

  removeMessageListener(
    message: "receiveStreamThreadResponse",
    listener: ResponseListener
  ) {
    expect(message).toBe("receiveStreamThreadResponse");
    this._listeners.delete(listener);
  }

  reset() {
    this.aborts.length = 0;
    this.starts.length = 0;
    this._listeners.clear();
  }
}

const RPC = new ControllableRpc();

await mock.module("@/lib/electrobun", () => ({
  electrobun: { rpc: RPC },
}));

const { createRpcTransport } = await import("./rpc-transport");

const REQUEST: AgentStreamRequest = {
  model: { provider: "test", id: "test" },
  context: { messages: [], tools: [] },
};
const START: AgentEvent = { type: "agent_start" };
const TURN: AgentEvent = { type: "turn_start" };

function _startIterator(signal?: AbortSignal) {
  const iterator = createRpcTransport()(REQUEST, {
    signal,
  })[Symbol.asyncIterator]();
  const next = iterator.next();
  const streamId = RPC.starts.at(-1)?.streamId;
  if (!streamId) {
    throw new Error("transport did not start an RPC stream");
  }
  return { iterator, next, streamId };
}

async function _captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("Expected promise to reject");
  } catch (error) {
    return error;
  }
}

describe("createRpcTransport", () => {
  beforeEach(() => {
    RPC.reset();
  });

  test("drains queued events in order before completing", async () => {
    const { iterator, next, streamId } = _startIterator();

    RPC.emit({ streamId, type: "event", event: START });
    RPC.emit({ streamId, type: "event", event: TURN });
    RPC.emit({ streamId, type: "done" });

    expect(await next).toEqual({ value: START, done: false });
    expect(await iterator.next()).toEqual({ value: TURN, done: false });
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
    expect(RPC.listenerCount).toBe(0);
    expect(RPC.aborts).toEqual([]);
  });

  test("rejects remote errors and removes its listener", async () => {
    const { next, streamId } = _startIterator();

    RPC.emit({ streamId, type: "error", message: "remote exploded" });

    expect(await _captureRejection(next)).toEqual(
      new Error("remote exploded")
    );
    expect(RPC.listenerCount).toBe(0);
    expect(RPC.aborts).toEqual([]);
  });

  test("sends one Bun abort and rejects with AbortError", async () => {
    const controller = new AbortController();
    const { next, streamId } = _startIterator(controller.signal);

    controller.abort();

    expect(await _captureRejection(next)).toMatchObject({ name: "AbortError" });
    expect(RPC.aborts).toEqual([{ streamId }]);
    expect(RPC.listenerCount).toBe(0);

    controller.abort();
    expect(RPC.aborts).toEqual([{ streamId }]);
  });

  test("aborts Bun and removes its listener when the consumer exits early", async () => {
    const { iterator, next, streamId } = _startIterator();
    RPC.emit({ streamId, type: "event", event: START });
    expect(await next).toEqual({ value: START, done: false });

    await iterator.return?.(undefined);

    expect(RPC.aborts).toEqual([{ streamId }]);
    expect(RPC.listenerCount).toBe(0);
  });

  test("isolates concurrent streams by stream ID", async () => {
    const first = _startIterator();
    const second = _startIterator();
    expect(first.streamId).not.toBe(second.streamId);

    RPC.emit({ streamId: second.streamId, type: "event", event: TURN });
    RPC.emit({ streamId: first.streamId, type: "event", event: START });
    RPC.emit({ streamId: first.streamId, type: "done" });
    RPC.emit({ streamId: second.streamId, type: "done" });

    expect(await first.next).toEqual({ value: START, done: false });
    expect(await second.next).toEqual({ value: TURN, done: false });
    expect(await first.iterator.next()).toEqual({
      value: undefined,
      done: true,
    });
    expect(await second.iterator.next()).toEqual({
      value: undefined,
      done: true,
    });
    expect(RPC.listenerCount).toBe(0);
    expect(RPC.aborts).toEqual([]);
  });

  test("drains a large queued burst without losing order", async () => {
    const { iterator, next, streamId } = _startIterator();
    const queued: AgentEvent[] = [];
    for (let index = 0; index < 4096; index += 1) {
      queued.push(index % 2 === 0 ? START : TURN);
    }
    for (const event of queued) {
      RPC.emit({ streamId, type: "event", event });
    }
    RPC.emit({ streamId, type: "done" });

    const received: AgentEvent[] = [(await next).value as AgentEvent];
    while (true) {
      const result = await iterator.next();
      if (result.done) break;
      received.push(result.value);
    }

    expect(received).toEqual(queued);
    expect(RPC.listenerCount).toBe(0);
    expect(RPC.aborts).toEqual([]);
  });
});
