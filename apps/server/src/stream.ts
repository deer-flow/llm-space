import {
  uuid,
  type AgentStreamRequest,
  type ProviderConnectionRef,
} from "@llm-space/core";
import type { RuntimeClient } from "@llm-space/runtime/runtime";

import { ServerError } from "./errors";

export function createStreamResponse(
  runtime: RuntimeClient,
  input: unknown
): Response {
  const { request, connection } = _parseStreamRequest(input);
  const streamId = uuid();
  const encoder = new TextEncoder();
  let abort: (() => void) | null = null;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const abortController = new AbortController();
      abort = () => abortController.abort();
      controller.enqueue(encoder.encode(_sseData("[START]")));
      void (async () => {
        try {
          await runtime.streamThread(
            { streamId, request, connection },
            (message) => {
              if (message.type === "event") {
                controller.enqueue(encoder.encode(_sseData(message.event)));
              } else if (message.type === "error") {
                controller.enqueue(
                  encoder.encode(
                    _sseData({
                      type: "error",
                      message: message.message,
                    })
                  )
                );
              }
            }
          );
          controller.enqueue(encoder.encode(_sseData("[DONE]")));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      })();
      abortController.signal.addEventListener(
        "abort",
        () => runtime.abortStream({ streamId }),
        { once: true }
      );
    },
    cancel() {
      abort?.();
      runtime.abortStream({ streamId });
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function _parseStreamRequest(input: unknown): {
  request: AgentStreamRequest;
  connection?: ProviderConnectionRef;
} {
  if (!input || typeof input !== "object") {
    throw new ServerError(
      "invalid_request",
      "Stream request must be an object."
    );
  }
  const body = input as { request?: unknown; connection?: unknown };
  const request = body.request;
  if (!request || typeof request !== "object") {
    throw new ServerError(
      "invalid_request",
      'Stream request body must include object field "request".'
    );
  }
  const connection = _parseProviderConnection(body.connection);
  return {
    request: request as AgentStreamRequest,
    ...(connection ? { connection } : {}),
  };
}

function _parseProviderConnection(
  input: unknown
): ProviderConnectionRef | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ServerError("invalid_request", '"connection" must be an object.');
  }
  const { providerId, profileId } = input as {
    providerId?: unknown;
    profileId?: unknown;
  };
  if (typeof providerId !== "string" || !providerId) {
    throw new ServerError(
      "invalid_request",
      '"connection.providerId" must be a string.'
    );
  }
  if (profileId !== undefined && (typeof profileId !== "string" || !profileId)) {
    throw new ServerError(
      "invalid_request",
      '"connection.profileId" must be a string.'
    );
  }
  return {
    providerId,
    ...(typeof profileId === "string" ? { profileId } : {}),
  };
}

function _sseData(value: unknown): string {
  const data = typeof value === "string" ? value : JSON.stringify(value);
  return `data: ${data}\n\n`;
}
