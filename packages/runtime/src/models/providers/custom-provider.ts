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

import { DEFAULT_CUSTOM_PROVIDER_API, type CustomProviderApi } from "../types";

export function createCustomProvider({
  id,
  name,
  baseUrl,
  api = DEFAULT_CUSTOM_PROVIDER_API,
  models,
}: {
  id: string;
  name: string;
  baseUrl: string;
  api?: CustomProviderApi;
  models: Model<Api>[];
}): Provider {
  const implementation = {
    "anthropic-messages": anthropicMessagesApi,
    "openai-completions": openAICompletionsApi,
    "openai-responses": openAIResponsesApi,
  }[api]();

  return createProvider({
    id,
    name,
    baseUrl,
    auth: { apiKey: envApiKeyAuth("NOT_A_KEY", []) },
    models,
    api: implementation,
  });
}
