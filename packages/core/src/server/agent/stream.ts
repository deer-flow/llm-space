import {
  agentLoopContinue,
  type AgentEvent,
  type AgentMessage,
  type AgentTool,
} from "@earendil-works/pi-agent-core";
import type { Api, Message, Model, Models, Tool } from "@earendil-works/pi-ai";

import type { AgentStreamRequest } from "../../types/agent";

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
  }
): AsyncGenerator<AgentEvent> {
  const { models, signal, getApiKey } = options;

  if (request.context.messages.length > 0) {
    const lastMessage =
      request.context.messages[request.context.messages.length - 1]!;
    if (lastMessage.role === "assistant") {
      throw new Error(
        "The last message must be a user message or a tool call result."
      );
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

  const agentStream = agentLoopContinue(
    {
      ...request.context,
      systemPrompt: request.context.systemPrompt ?? "",
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
    (streamModel, streamContext, streamOptions) =>
      models.streamSimple(streamModel, streamContext, streamOptions)
  );

  for await (const event of agentStream) {
    yield event;
  }
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
