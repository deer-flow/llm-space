import type { AgentEvent } from "@earendil-works/pi-agent-core";

import type { AgentStreamRequest } from "../types/agent";
import type { ModelConfig } from "../types/models";
import type { ThreadContext } from "../types/threads";

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
  yield* transport(request, { signal: config.signal });
}
