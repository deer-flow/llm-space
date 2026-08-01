import { uuid, type AgentStreamRequest } from "@llm-space/core";
import type { RuntimeClient } from "@llm-space/runtime/runtime";

import { ServerError } from "./errors";

export function createStreamResponse(
  runtime: RuntimeClient,
  input: unknown
): Response {
  const { request, profileId } = _parseStreamRequest(input);
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
            { streamId, request, profileId },
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
  profileId?: string;
} {
  if (!input || typeof input !== "object") {
    throw new ServerError(
      "invalid_request",
      "Stream request must be an object."
    );
  }
  const body = input as { request?: unknown; profileId?: unknown };
  const request = body.request;
  if (!request || typeof request !== "object") {
    throw new ServerError(
      "invalid_request",
      'Stream request body must include object field "request".'
    );
  }
  if (body.profileId !== undefined && typeof body.profileId !== "string") {
    throw new ServerError("invalid_request", '"profileId" must be a string.');
  }
  return {
    request: request as AgentStreamRequest,
    ...(body.profileId ? { profileId: body.profileId } : {}),
  };
}

function _sseData(value: unknown): string {
  const data = typeof value === "string" ? value : JSON.stringify(value);
  return `data: ${data}\n\n`;
}
