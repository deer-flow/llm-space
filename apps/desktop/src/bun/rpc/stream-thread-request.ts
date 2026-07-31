import type { RuntimeClient } from "@llm-space/runtime/runtime";

import type {
  StreamThreadRequestPayload,
  StreamThreadResponsePayload,
} from "../../shared/rpc";

export async function forwardStreamThread(
  runtime: RuntimeClient,
  payload: StreamThreadRequestPayload,
  send: (message: StreamThreadResponsePayload) => void
): Promise<void> {
  try {
    await runtime.streamThread(payload, send);
  } catch (error) {
    if (_isAbortError(error)) {
      return;
    }
    send({
      streamId: payload.streamId,
      type: "error",
      message: error instanceof Error ? error.message : "Internal error",
    });
  }
}

function _isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
