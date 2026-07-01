import { streamAgent } from "@llm-space/core/server";

import type {
  AbortStreamThreadPayload,
  StreamThreadRequestPayload,
  StreamThreadResponsePayload,
} from "../../shared/rpc";
import { modelManager } from "../models";

/** Abort controllers for in-flight streams, keyed by `streamId`. */
const activeStreams = new Map<string, AbortController>();

/**
 * Run an agent stream for the webview, pushing each event back as an RPC
 * message. Mirrors the web SSE route, but over Electrobun messages.
 */
export async function runStreamThread(
  payload: StreamThreadRequestPayload,
  send: (message: StreamThreadResponsePayload) => void
): Promise<void> {
  const { streamId, request } = payload;
  const abortController = new AbortController();
  activeStreams.set(streamId, abortController);
  try {
    for await (const event of streamAgent(request, {
      models: await modelManager.getAvailableModels(),
      getApiKey: modelManager.getApiKey.bind(modelManager),
      getBaseUrl: modelManager.getBaseUrl.bind(modelManager),
      signal: abortController.signal,
    })) {
      send({ streamId, type: "event", event });
    }
    send({ streamId, type: "done" });
  } catch (error) {
    // The client aborted and has already torn down its listener; stay quiet.
    if (abortController.signal.aborted) {
      return;
    }
    send({
      streamId,
      type: "error",
      message: error instanceof Error ? error.message : "Internal error",
    });
  } finally {
    activeStreams.delete(streamId);
  }
}

/** Abort an in-flight stream started by {@link runStreamThread}. */
export function abortStreamThread({
  streamId,
}: AbortStreamThreadPayload): void {
  activeStreams.get(streamId)?.abort();
}
