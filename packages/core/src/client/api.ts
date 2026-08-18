import type { AgentEvent } from "@earendil-works/pi-agent-core";

import type {
  ThreadRunEvent,
  ThreadRunPolicy,
  ThreadRunTransport,
} from "../thread/run-loop";
import type { AgentStreamRequest } from "../types/agent";
import type { ModelConfig, ProviderConnectionRef } from "../types/models";
import type { Thread, ThreadContext } from "../types/threads";

import { convertToPiContext } from "./converters";
import {
  isRunnableConversation,
  RUN_LAST_MESSAGE_ERROR,
} from "./run-eligibility";
import { createHttpTransport, type AgentTransport } from "./transport";

export async function* streamThread(
  args: { context: ThreadContext; model: ModelConfig },
  config: {
    signal?: AbortSignal;
    endpoint?: string;
    transport?: AgentTransport;
    /** Ephemeral provider profile selection; never written into the thread. */
    connection?: ProviderConnectionRef;
  } = {}
): AsyncGenerator<AgentEvent> {
  if (!isRunnableConversation(args.context.messages)) {
    throw new Error(RUN_LAST_MESSAGE_ERROR);
  }
  const context = convertToPiContext(args.context);
  const request: AgentStreamRequest = {
    model: {
      provider: args.model.provider,
      id: args.model.id,
    },
    config: {
      model: args.model.params,
    },
    context,
  };
  // Transport is the only HTTP-vs-RPC-specific piece; default to HTTP/SSE.
  const transport = config.transport ?? createHttpTransport(config.endpoint);
  yield* transport(request, {
    signal: config.signal,
    connection: config.connection,
  });
}

/** Stream a full tool loop from a host that already owns {@link runThreadLoop}. */
export async function* runThread(
  args: {
    context: ThreadContext;
    model: ModelConfig;
    thread: Thread;
    policy: ThreadRunPolicy;
  },
  config: {
    signal?: AbortSignal;
    transport: ThreadRunTransport;
    connection?: ProviderConnectionRef;
    onPause?: "pause" | "fail";
  }
): AsyncGenerator<ThreadRunEvent> {
  if (!isRunnableConversation(args.context.messages)) {
    throw new Error(RUN_LAST_MESSAGE_ERROR);
  }
  const request: AgentStreamRequest = {
    model: {
      provider: args.model.provider,
      id: args.model.id,
    },
    config: {
      model: args.model.params,
    },
    context: convertToPiContext(args.context),
  };
  yield* config.transport(request, {
    signal: config.signal,
    connection: config.connection,
    policy: args.policy,
    thread: args.thread,
    onPause: config.onPause,
  });
}
