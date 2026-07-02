import {
  createProvider,
  envApiKeyAuth,
  type Api,
  type Model,
  type Provider,
} from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";

export function createCustomProvider({
  id,
  name,
  baseUrl,
  models,
}: {
  id: string;
  name: string;
  baseUrl: string;
  models: Model<Api>[];
}): Provider {
  return createProvider({
    id,
    name,
    baseUrl,
    auth: { apiKey: envApiKeyAuth("NOT_A_KEY", []) },
    models,
    api: {
      "anthropic-messages": anthropicMessagesApi(),
      "openai-completions": openAICompletionsApi(),
      "openai-responses": openAIResponsesApi(),
    },
  });
}
