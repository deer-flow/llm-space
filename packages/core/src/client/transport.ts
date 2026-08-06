import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { parseServerSentEvents, type ServerSentEvent } from "parse-sse";

import type { AgentStreamRequest } from "../types/agent";
import type { ProviderConnectionRef } from "../types/models";

/**
 * The streaming primitive behind `streamThread`. Given an already-prepared
 * (pi-format) request and an abort signal, it carries the request to the server
 * side and yields the resulting `AgentEvent`s. Swapping the transport is the
 * only thing that differs between deployments (HTTP for the web app, Electrobun
 * RPC for the desktop app) — convert/validate/reduce stay shared.
 */
export type AgentTransport = (
  request: AgentStreamRequest,
  options: { signal?: AbortSignal; connection?: ProviderConnectionRef }
) => AsyncIterable<AgentEvent>;

/**
 * The default transport: POST the request to the SSE endpoint and parse the
 * server-sent events into `AgentEvent`s.
 */
export function createHttpTransport(
  endpoint = "/api/pi/agent/stream"
): AgentTransport {
  return async function* httpTransport(request, { signal, connection }) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        request,
        ...(connection ? { connection } : {}),
      }),
      signal,
    });
    if (!res.ok) {
      throw new Error(`Failed to stream thread: ${res.statusText}`);
    }
    const eventStream = parseServerSentEvents(
      res
    ) as unknown as AsyncIterable<ServerSentEvent>;
    for await (const chunk of eventStream) {
      if (chunk.data === "[START]" || chunk.data === "[DONE]") {
        // Ignore lifecycle events
      } else {
        yield JSON.parse(chunk.data) as AgentEvent;
      }
    }
  };
}
