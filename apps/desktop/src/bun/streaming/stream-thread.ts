import { streamAgent } from "@llm-space/core/server";

import type {
  AbortStreamThreadPayload,
  StreamThreadRequestPayload,
  StreamThreadResponsePayload,
} from "../../shared/rpc";
import { analytics } from "../analytics";
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
  const startedAt = Date.now();
  // Resolved in each terminal branch, then reported once in `finally` so a
  // single run always yields exactly one anonymous `thread_run` event.
  let outcome: "completed" | "error" | "aborted" = "error";
  try {
    for await (const event of streamAgent(request, {
      models: await modelManager.getAvailableModels(),
      getApiKey: modelManager.getApiKey.bind(modelManager),
      getBaseUrl: modelManager.getBaseUrl.bind(modelManager),
      getHeaders: modelManager.getHeaders.bind(modelManager),
      signal: abortController.signal,
    })) {
      send({ streamId, type: "event", event });
    }
    outcome = "completed";
    send({ streamId, type: "done" });
  } catch (error) {
    // The client aborted and has already torn down its listener; stay quiet.
    if (abortController.signal.aborted) {
      outcome = "aborted";
      return;
    }
    send({
      streamId,
      type: "error",
      message: error instanceof Error ? error.message : "Internal error",
    });
  } finally {
    activeStreams.delete(streamId);
    // Anonymous shape/outcome metadata only - never any message content.
    analytics.capture("thread_run", {
      ..._scrubModelForTelemetry(request.model),
      outcome,
      durationMs: Date.now() - startedAt,
      messageCount: request.context.messages.length,
      toolCount: request.context.tools.length,
      hasSystemPrompt: Boolean(request.context.systemPrompt),
    });
  }
}

/**
 * Collapse a run's model selector for telemetry. Only ids from a shipped
 * builtin catalog are reported verbatim; user-typed providers and models
 * become the literal "custom" so a private name never leaves the machine.
 */
function _scrubModelForTelemetry(model: { provider: string; id: string }): {
  provider: string;
  model: string;
} {
  return {
    provider: modelManager.isBuiltin(model.provider)
      ? model.provider
      : "custom",
    model: modelManager.isBuiltinCatalogModel(model.provider, model.id)
      ? model.id
      : "custom",
  };
}

/** Abort an in-flight stream started by {@link runStreamThread}. */
export function abortStreamThread({
  streamId,
}: AbortStreamThreadPayload): void {
  activeStreams.get(streamId)?.abort();
}

/** Run a minimal completion to verify that a configured model can respond. */
export async function testModelConnection({
  providerId,
  modelId,
}: {
  providerId: string;
  modelId: string;
}): Promise<void> {
  const abortController = new AbortController();
  for await (const event of streamAgent(
    {
      model: { provider: providerId, id: modelId },
      context: {
        systemPrompt: "Reply with ok.",
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Test connection." }],
            timestamp: Date.now(),
          },
        ],
        tools: [],
      },
    },
    {
      models: await modelManager.getAvailableModels(),
      getApiKey: modelManager.getApiKey.bind(modelManager),
      getBaseUrl: modelManager.getBaseUrl.bind(modelManager),
      getHeaders: modelManager.getHeaders.bind(modelManager),
      signal: abortController.signal,
    }
  )) {
    void event;
    // Drain the stream; success only means the provider completed the request.
  }
}
