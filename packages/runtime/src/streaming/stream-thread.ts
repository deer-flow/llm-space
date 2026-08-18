import {
  convertToPiContext,
  type CustomModel,
  type SkillInfo,
} from "@llm-space/core";
import { streamAgent } from "@llm-space/core/server";
import {
  type ExecuteThreadTool,
  runThreadLoop,
} from "@llm-space/core/thread";

import type { ModelManager } from "../models";
import type {
  RuntimeAbortStreamPayload,
  RuntimeStreamRequestPayload,
  RuntimeStreamResponsePayload,
} from "../runtime";

export interface StreamThreadRunHost {
  executeTool: ExecuteThreadTool;
  loadSkills?: () => Promise<SkillInfo[]>;
  loadFile?: (path: string) => Promise<string>;
  fileExists?: (path: string) => Promise<boolean>;
  resolvePath?: (path: string) => Promise<string>;
}

/** Process-scoped agent streaming and model-connection controller. */
export class StreamThreadController {
  private readonly _activeStreams = new Map<string, AbortController>();

  constructor(
    private readonly _modelManager: ModelManager,
    private readonly _analytics?: {
      capture(event: "thread_run", properties: Record<string, unknown>): void;
    }
  ) {}

  /** Run an agent stream and push each event back through the caller's sender. */
  async run(
    payload: RuntimeStreamRequestPayload,
    send: (message: RuntimeStreamResponsePayload) => void,
    host?: StreamThreadRunHost
  ): Promise<void> {
    const { streamId, request } = payload;
    const abortController = new AbortController();
    this._activeStreams.set(streamId, abortController);
    const startedAt = Date.now();
    let outcome: "completed" | "error" | "aborted" = "error";
    try {
      const connectionRef = payload.connection ?? {
        providerId: request.model.provider,
      };
      if (connectionRef.providerId !== request.model.provider) {
        throw new Error(
          `Model ${request.model.provider}/${request.model.id} cannot use provider connection ${connectionRef.providerId}.`
        );
      }
      const connection = await this._modelManager.resolveConnection(
        connectionRef
      );
      const streamOptions = {
        models: await this._modelManager.getAvailableModels(),
        getApiKey: () => connection.apiKey,
        getBaseUrl: () => connection.baseUrl,
        getHeaders: () => connection.headers,
        signal: abortController.signal,
      };
      if (payload.thread) {
        const reason = await this._runLoop(
          payload,
          send,
          streamOptions,
          host
        );
        outcome =
          reason === "aborted"
            ? "aborted"
            : reason === "failed"
              ? "error"
              : "completed";
        return;
      }
      for await (const event of streamAgent(request, streamOptions)) {
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
      this._analytics?.capture("thread_run", {
        ...this._scrubModelForTelemetry(request.model),
        outcome,
        durationMs: Date.now() - startedAt,
        messageCount: request.context.messages.length,
        toolCount: request.context.tools.length,
        hasSystemPrompt: Boolean(request.context.systemPrompt),
      });
    }
  }

  private async _runLoop(
    payload: RuntimeStreamRequestPayload,
    send: (message: RuntimeStreamResponsePayload) => void,
    streamOptions: Parameters<typeof streamAgent>[1],
    host?: StreamThreadRunHost
  ): Promise<"completed" | "aborted" | "failed"> {
    const thread = payload.thread;
    if (!thread) {
      throw new Error("Thread is required to run the tool loop.");
    }
    const { streamId, request } = payload;
    let endReason: "completed" | "aborted" | "failed" = "completed";
    for await (const event of runThreadLoop({
      thread,
      messages: thread.context?.messages ?? [],
      policy: payload.policy,
      signal: streamOptions.signal,
      onPause: payload.onPause ?? "pause",
      executeTool: host?.executeTool,
      loadSkills: host?.loadSkills,
      loadFile: host?.loadFile,
      fileExists: host?.fileExists,
      resolvePath: host?.resolvePath,
      streamTurn: (context) =>
        streamAgent(
          {
            ...request,
            context: convertToPiContext(context),
          },
          streamOptions
        ),
    })) {
      if (event.type === "agent_event") {
        send({ streamId, type: "event", event: event.event });
        continue;
      }
      if (event.type === "tool_start") {
        send({
          streamId,
          type: "tool_start",
          toolCallIds: event.toolCallIds,
        });
        continue;
      }
      if (event.type === "tool_result") {
        send({
          streamId,
          type: "tool_result",
          toolCallId: event.toolCallId,
          content: event.content,
          isError: event.isError,
        });
        continue;
      }
      if (event.type === "paused") {
        send({
          streamId,
          type: "paused",
          reason: event.reason,
          toolCallIds: event.toolCallIds,
        });
        continue;
      }
      if (event.reason === "aborted") {
        endReason = "aborted";
        continue;
      }
      if (event.reason === "failed") {
        endReason = "failed";
        send({
          streamId,
          type: "error",
          message: event.error ?? "Thread run failed",
        });
        continue;
      }
      send({ streamId, type: "done" });
    }
    return endReason;
  }

  /** Abort one in-flight stream. */
  abort({ streamId }: RuntimeAbortStreamPayload): void {
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
    profileId,
    modelId,
    candidate,
  }: {
    providerId: string;
    profileId?: string;
    modelId: string;
    candidate?: CustomModel;
  }): Promise<void> {
    const models = candidate
      ? this._modelManager.buildModelsWithCandidate(providerId, candidate)
      : await this._modelManager.getAvailableModels();
    const targetId = candidate?.id ?? modelId;
    const connection = await this._modelManager.resolveConnection({
      providerId,
      profileId,
    });
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
            responseApiNativeTools: [],
          },
        },
        {
          models,
          getApiKey: () => connection.apiKey,
          getBaseUrl: () => connection.baseUrl,
          getHeaders: () => connection.headers,
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

  /** Keep telemetry useful without recording custom provider or model names. */
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
