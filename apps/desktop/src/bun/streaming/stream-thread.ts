import type { CustomModel } from "@llm-space/core";
import { streamAgent } from "@llm-space/core/server";

import type {
  AbortStreamThreadPayload,
  StreamThreadRequestPayload,
  StreamThreadResponsePayload,
} from "../../shared/rpc";
import type { Analytics } from "../analytics";
import type { ModelManager } from "../models";

/** Process-scoped agent streaming and model-connection controller. */
export class StreamThreadController {
  private readonly _activeStreams = new Map<string, AbortController>();

  constructor(
    private readonly _modelManager: ModelManager,
    private readonly _analytics: Analytics
  ) {}

  /** Run an agent stream and push each event back through the caller's sender. */
  async run(
    payload: StreamThreadRequestPayload,
    send: (message: StreamThreadResponsePayload) => void
  ): Promise<void> {
    const { streamId, request } = payload;
    const abortController = new AbortController();
    this._activeStreams.set(streamId, abortController);
    const startedAt = Date.now();
    let outcome: "completed" | "error" | "aborted" = "error";
    try {
      for await (const event of streamAgent(request, {
        models: await this._modelManager.getAvailableModels(),
        getApiKey: this._modelManager.getApiKey.bind(this._modelManager),
        getBaseUrl: this._modelManager.getBaseUrl.bind(this._modelManager),
        getHeaders: this._modelManager.getHeaders.bind(this._modelManager),
        signal: abortController.signal,
      })) {
        send({ streamId, type: "event", event });
      }
      outcome = "completed";
      send({ streamId, type: "done" });
    } catch (error) {
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
      this._activeStreams.delete(streamId);
      this._analytics.capture("thread_run", {
        ...this._scrubModelForTelemetry(request.model),
        outcome,
        durationMs: Date.now() - startedAt,
        messageCount: request.context.messages.length,
        toolCount: request.context.tools.length,
        hasSystemPrompt: Boolean(request.context.systemPrompt),
      });
    }
  }

  /** Abort one in-flight stream. */
  abort({ streamId }: AbortStreamThreadPayload): void {
    this._activeStreams.get(streamId)?.abort();
  }

  /** Abort every in-flight stream during application shutdown. */
  shutdown(): void {
    for (const controller of this._activeStreams.values()) {
      controller.abort();
    }
    this._activeStreams.clear();
  }

  /** Verify a provider with a minimal completion through the normal agent path. */
  async testModelConnection({
    providerId,
    modelId,
    candidate,
  }: {
    providerId: string;
    modelId: string;
    candidate?: CustomModel;
  }): Promise<void> {
    const models = candidate
      ? this._modelManager.buildModelsWithCandidate(providerId, candidate)
      : await this._modelManager.getAvailableModels();
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
          getApiKey: this._modelManager.getApiKey.bind(this._modelManager),
          getBaseUrl: this._modelManager.getBaseUrl.bind(this._modelManager),
          getHeaders: this._modelManager.getHeaders.bind(this._modelManager),
          signal: abortController.signal,
        }
      )) {
        if (event.type === "agent_end") {
          for (const message of event.messages) {
            if (message.role === "assistant" && message.errorMessage) {
              throw new Error(message.errorMessage);
            }
          }
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        detail.trim() ||
          `Could not reach ${providerId}/${targetId}. Check the Base URL and API key.`,
        { cause: error }
      );
    }
  }

  private _scrubModelForTelemetry(model: { provider: string; id: string }): {
    provider: string;
    model: string;
  } {
    return {
      provider: this._modelManager.isBuiltin(model.provider)
        ? model.provider
        : "custom",
      model: this._modelManager.isBuiltinCatalogModel(model.provider, model.id)
        ? model.id
        : "custom",
    };
  }
}
