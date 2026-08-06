import {
  agentLoopContinue,
  type AgentEvent,
  type AgentMessage,
  type AgentTool,
} from "@earendil-works/pi-agent-core";
import type { Api, Message, Model, Models, Tool } from "@earendil-works/pi-ai";

import { RUN_LAST_MESSAGE_ERROR } from "../../client/run-eligibility";
import type { AgentStreamRequest } from "../../types/agent";

import { applyResponseFormat } from "./response-format";

/**
 * Run a single agent stream: validate, resolve the model from the given
 * `Models` collection, and drive the agent loop — yielding each `AgentEvent`.
 *
 * This is the shared server-side implementation behind every transport: the web
 * SSE route and the desktop bun process both wrap it. The `models` collection is
 * injected so each deployment resolves auth through its own provider config.
 */
export async function* streamAgent(
  request: AgentStreamRequest,
  options: {
    models: Models;
    signal: AbortSignal;
    /**
     * Resolve a provider's API key (e.g. from user config). Returns `undefined`
     * to fall back to the provider's own `auth` resolution.
     */
    getApiKey?: (
      provider: string
    ) => Promise<string | undefined> | string | undefined;
    /**
     * Resolve a provider's custom base URL (e.g. from user config). Returns
     * `undefined`/empty to keep the provider's default endpoint.
     */
    getBaseUrl?: (
      provider: string
    ) => Promise<string | undefined> | string | undefined;
    /**
     * Resolve a provider's extra HTTP headers (e.g. from user config). Returns
     * `undefined`/empty to send no extra headers.
     */
    getHeaders?: (
      provider: string
    ) =>
      | Promise<Record<string, string> | undefined>
      | Record<string, string>
      | undefined;
  }
): AsyncGenerator<AgentEvent> {
  const { models, signal, getApiKey, getBaseUrl, getHeaders } = options;

  if (request.context.messages.length > 0) {
    const lastMessage =
      request.context.messages[request.context.messages.length - 1]!;
    if (lastMessage.role === "assistant") {
      throw new Error(RUN_LAST_MESSAGE_ERROR);
    }
  }

  const model = models.getModel(
    request.model.provider,
    request.model.id
  ) as Model<Api> | null;
  if (!model) {
    throw new Error(
      `Model "${request.model.provider}/${request.model.id}" not found`
    );
  }
  const responseApiNativeTools = request.context.responseApiNativeTools ?? [];
  // Apply a user-configured base URL override for THIS run only. pi keeps a
  // process-global model registry, so `models.getModel()` hands back a shared
  // object; mutating its `baseUrl` permanently would leak across runs (e.g.
  // clearing the override later would keep using the old URL). We restore it in
  // the `finally` below so the shared model always returns to its default.
  const originalBaseUrl = model.baseUrl;
  const baseUrl = await getBaseUrl?.(request.model.provider);
  if (baseUrl) {
    model.baseUrl = baseUrl;
  }

  // User-configured extra headers, injected per call through the stream
  // options below (never by mutating the shared model object). pi merges
  // `options.headers` over `model.headers`; explicit per-call headers from the
  // agent loop win over the configured ones on collision.
  const configuredHeaders = await getHeaders?.(request.model.provider);
  const hasConfiguredHeaders =
    configuredHeaders && Object.keys(configuredHeaders).length > 0;

  // A configured structured-output format ("json_object"/"json_schema"). pi-ai
  // has no typed option for it, so we inject it per-provider through the
  // `onPayload` hook in the streamFn below (see `applyResponseFormat`).
  const responseType = request.config?.model?.responseType;
  const hasResponseFormat = responseType && responseType.type !== "text";

  const agentStream = agentLoopContinue(
    {
      systemPrompt: request.context.systemPrompt ?? "",
      messages: request.context.messages,
      tools: _convertToAgentTools(request.context.tools, { stepByStep: true }),
    },
    {
      model,
      convertToLlm: _convertToLlm,
      getApiKey,
      maxTokens: request.config?.model?.maxTokens,
      temperature: request.config?.model?.temperature,
      reasoning:
        request.config?.model?.reasoning === "off"
          ? undefined
          : (request.config?.model?.reasoning ?? undefined),
    },
    signal,
    // Stream through the `Models` collection so auth is resolved by each
    // provider's own `auth` config (e.g. `envApiKeyAuth`). The default
    // streamFn is the legacy compat layer, which only knows a hardcoded
    // builtin provider→env-var map and ignores custom providers' auth.
    (streamModel, streamContext, streamOptions) => {
      const mergedOptions = { ...streamOptions };
      if (hasConfiguredHeaders) {
        mergedOptions.headers = {
          ...configuredHeaders,
          ...streamOptions?.headers,
        };
      }
      if (responseApiNativeTools.length > 0 || hasResponseFormat) {
        // Chain onto any existing payload hook, then inject app-owned request
        // fields into the provider's fully-built payload. Native definitions
        // stay opaque here: provider validation remains authoritative.
        const priorOnPayload = mergedOptions.onPayload;
        mergedOptions.onPayload = async (payload, payloadModel) => {
          const replaced = priorOnPayload
            ? await priorOnPayload(payload, payloadModel)
            : undefined;
          let nextPayload = replaced ?? payload;
          if (responseApiNativeTools.length > 0) {
            nextPayload = _appendResponseApiNativeTools(
              nextPayload,
              responseApiNativeTools,
              payloadModel
            );
          }
          return hasResponseFormat
            ? applyResponseFormat(nextPayload, payloadModel, responseType)
            : nextPayload;
        };
      }
      return models.streamSimple(streamModel, streamContext, mergedOptions);
    }
  );

  try {
    for await (const event of agentStream) {
      yield event;
    }
  } finally {
    // Undo the per-run override on the shared model object (see above).
    model.baseUrl = originalBaseUrl;
  }
}

function _appendResponseApiNativeTools(
  payload: unknown,
  nativeTools: readonly Record<string, unknown>[],
  model: Model<Api>
): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  const body = payload as Record<string, unknown>;
  if (model.api === "google-generative-ai" || model.api === "google-vertex") {
    const config = _objectField(body.config);
    return { ...body, config: _appendTools(config, nativeTools) };
  }
  if (model.api === "bedrock-converse-stream") {
    const toolConfig = _objectField(body.toolConfig);
    return { ...body, toolConfig: _appendTools(toolConfig, nativeTools) };
  }
  if (model.api === "pi-messages") {
    const context = _objectField(body.context);
    return { ...body, context: _appendTools(context, nativeTools) };
  }
  return _appendTools(body, nativeTools);
}

function _objectField(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function _appendTools(
  container: Record<string, unknown>,
  nativeTools: readonly Record<string, unknown>[]
): Record<string, unknown> {
  const tools: unknown[] = Array.isArray(container.tools)
    ? (container.tools as unknown[])
    : [];
  return { ...container, tools: [...tools, ...nativeTools] };
}

function _convertToLlm(messages: AgentMessage[]): Message[] {
  return messages.filter(
    (message) =>
      message.role === "user" ||
      message.role === "assistant" ||
      message.role === "toolResult"
  );
}

function _convertToAgentTools(
  tools: Tool[],
  { stepByStep = true }: { stepByStep?: boolean } = {}
): AgentTool[] {
  return tools.map(
    (tool) =>
      ({
        name: tool.name,
        label: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        async execute() {
          if (stepByStep) {
            return Promise.resolve({
              terminate: true,
              content: [
                {
                  type: "text",
                  text: "",
                },
              ],
              details: undefined,
            });
          }
          return Promise.resolve({
            content: [
              {
                type: "text",
                text: "",
              },
            ],
            details: undefined,
          });
        },
      }) as AgentTool
  );
}
