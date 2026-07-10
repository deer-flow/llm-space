import type { CustomModel } from "@llm-space/core";
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

/**
 * Verify that a provider's Base URL and API key are valid by running a real —
 * but minimal — completion through the exact same `streamAgent` path used for
 * normal runs. The prompt just asks the model to reply "ok"; we don't check
 * *what* it replied, only that the provider accepted the request. A rejected
 * request (bad key, wrong Base URL, unknown model) surfaces as an `errorMessage`
 * on the streamed result rather than a thrown error, so we inspect for that and
 * rethrow — otherwise every request, even with a bogus key, would "succeed".
 */
export async function testModelConnection({
  providerId,
  modelId,
  candidate,
}: {
  providerId: string;
  modelId: string;
  // An unsaved model config to test as-is (from the editor dialog). When
  // present, it is merged into the provider's catalog so the connection can be
  // verified before the model is persisted; its `id` overrides `modelId`.
  candidate?: CustomModel;
}): Promise<void> {
  const models = candidate
    ? modelManager.buildModelsWithCandidate(providerId, candidate)
    : await modelManager.getAvailableModels();
  const targetId = candidate?.id ?? modelId;
  const abortController = new AbortController();
  try {
    for await (const event of streamAgent(
      {
        model: { provider: providerId, id: targetId },
        context: {
          systemPrompt: "You are a connection tester.",
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: 'Reply with "ok".' }],
              timestamp: Date.now(),
            },
          ],
          tools: [],
        },
      },
      {
        models,
        getApiKey: modelManager.getApiKey.bind(modelManager),
        getBaseUrl: modelManager.getBaseUrl.bind(modelManager),
        getHeaders: modelManager.getHeaders.bind(modelManager),
        signal: abortController.signal,
      }
    )) {
      // A bad API key / Base URL does NOT throw: per the StreamFn contract,
      // `streamAgent` encodes request and auth failures as a final assistant
      // message carrying an `errorMessage` and streams normally. Mirror the
      // client reducer and surface that error, otherwise any random key would
      // "succeed" just because the stream completed.
      if (event.type === "agent_end") {
        for (const message of event.messages) {
          if (message.role === "assistant" && message.errorMessage) {
            throw new Error(message.errorMessage);
          }
        }
      }
    }
  } catch (error) {
    // Always reject with a real, non-empty Error message. The provider SDK may
    // throw a non-Error value (or an Error with an empty message); the RPC layer
    // drops non-Error throws entirely, which would hang the caller until it
    // times out instead of telling the user what went wrong.
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      detail.trim() ||
        `Could not reach ${providerId}/${targetId}. Check the Base URL and API key.`,
      { cause: error }
    );
  }
}
