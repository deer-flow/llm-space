import { uuid, type AgentEvent, type AgentTransport } from "@llm-space/core";
import type { ThreadRunEvent, ThreadRunTransport } from "@llm-space/core/thread";

import { electrobun } from "@/lib/electrobun";
import type {
  StreamThreadRequestPayload,
  StreamThreadResponsePayload,
} from "@/shared/rpc";
import type { RuntimeId } from "@/shared/runtime";

import { runtimeScope } from "./runtime-scope";

const ABORT_ERROR = () =>
  new DOMException("The operation was aborted.", "AbortError");
const EVENT_COMPACTION_THRESHOLD = 1024;

/**
 * An {@link AgentTransport} backed by Electrobun RPC. It sends the prepared
 * request as a `sendStreamThreadRequest` message and bridges the incoming
 * `receiveStreamThreadResponse` messages into an async iterator of events.
 */
export function createRpcTransport(runtimeId?: RuntimeId): AgentTransport {
  return async function* rpcTransport(request, { signal, connection }) {
    yield* _rpcStream<AgentEvent>({
      runtimeId,
      signal,
      start: (streamId) => ({
        ...runtimeScope(runtimeId),
        streamId,
        request,
        connection,
      }),
      toEvent: (message) => {
        if (message.type === "event") {
          return message.event;
        }
        return null;
      },
    });
  };
}

/**
 * Run the full model/tool loop on bun and yield live display events.
 */
export function createRpcThreadRunTransport(
  runtimeId?: RuntimeId
): ThreadRunTransport {
  return async function* rpcThreadRunTransport(
    request,
    { signal, connection, policy, thread, onPause }
  ) {
    yield* _rpcStream<ThreadRunEvent>({
      runtimeId,
      signal,
      start: (streamId) => ({
        ...runtimeScope(runtimeId),
        streamId,
        request,
        connection,
        policy,
        thread,
        onPause,
      }),
      toEvent: _toThreadRunEvent,
    });
  };
}

function _toThreadRunEvent(
  message: StreamThreadResponsePayload
): ThreadRunEvent | null {
  if (message.type === "event") {
    return { type: "agent_event", event: message.event };
  }
  if (message.type === "tool_start") {
    return { type: "tool_start", toolCallIds: message.toolCallIds };
  }
  if (message.type === "tool_result") {
    return {
      type: "tool_result",
      toolCallId: message.toolCallId,
      content: message.content,
      isError: message.isError,
    };
  }
  if (message.type === "paused") {
    return {
      type: "paused",
      reason: message.reason,
      toolCallIds: message.toolCallIds,
    };
  }
  return null;
}

async function* _rpcStream<TEvent>({
  runtimeId,
  signal,
  start,
  toEvent,
}: {
  runtimeId?: RuntimeId;
  signal?: AbortSignal;
  start: (streamId: string) => StreamThreadRequestPayload;
  toEvent: (message: StreamThreadResponsePayload) => TEvent | null;
}): AsyncGenerator<TEvent> {
  const rpc = electrobun.rpc;
  if (!rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }

  const streamId = uuid();
  let events: (TEvent | undefined)[] = [];
  let eventHead = 0;
  let wake: (() => void) | null = null;
  let finished = false;
  let aborted = false;
  let errorMessage: string | null = null;
  const notify = () => {
    wake?.();
    wake = null;
  };

  const onResponse = (message: StreamThreadResponsePayload) => {
    if (message.streamId !== streamId) {
      return;
    }
    if (message.type === "done") {
      finished = true;
    } else if (message.type === "error") {
      errorMessage = message.message;
      finished = true;
    } else {
      const event = toEvent(message);
      if (event) {
        events.push(event);
      }
    }
    notify();
  };

  const onAbort = () => {
    rpc.send.abortStreamThread({ ...runtimeScope(runtimeId), streamId });
    aborted = true;
    finished = true;
    notify();
  };

  if (signal?.aborted) {
    throw ABORT_ERROR();
  }

  rpc.addMessageListener("receiveStreamThreadResponse", onResponse);
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    rpc.send.sendStreamThreadRequest(start(streamId));
    while (true) {
      while (eventHead < events.length) {
        const event = events[eventHead];
        events[eventHead] = undefined;
        eventHead += 1;
        yield event!;

        if (eventHead === events.length) {
          events.length = 0;
          eventHead = 0;
        } else if (
          eventHead >= EVENT_COMPACTION_THRESHOLD &&
          eventHead * 2 >= events.length
        ) {
          events = events.slice(eventHead);
          eventHead = 0;
        }
      }
      if (aborted) {
        throw ABORT_ERROR();
      }
      if (errorMessage !== null) {
        throw new Error(errorMessage);
      }
      if (finished) {
        return;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  } finally {
    rpc.removeMessageListener("receiveStreamThreadResponse", onResponse);
    signal?.removeEventListener("abort", onAbort);
    if (!finished) {
      rpc.send.abortStreamThread({ ...runtimeScope(runtimeId), streamId });
    }
  }
}
