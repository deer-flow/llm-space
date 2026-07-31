import {
  createProvider,
  envApiKeyAuth,
  type Provider,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

import { MINIMAX_MODELS } from "./minimax.models";

export function minimaxProvider(): Provider<"openai-completions"> {
  return createProvider({
    id: "minimax",
    name: "MiniMax",
    baseUrl: "https://api.minimax.io/v1",
    auth: { apiKey: envApiKeyAuth("MiniMax API key", ["MINIMAX_API_KEY"]) },
    models: Object.values(MINIMAX_MODELS),
    api: openAICompletionsApi(),
  });
}
