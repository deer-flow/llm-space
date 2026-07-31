import {
  createProvider,
  envApiKeyAuth,
  type Provider,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

import { MINIMAX_CN_MODELS } from "./minimax.models";

export function minimaxCnProvider(): Provider<"openai-completions"> {
  return createProvider({
    id: "minimax-cn",
    name: "MiniMax CN",
    baseUrl: "https://api.minimaxi.com/v1",
    auth: { apiKey: envApiKeyAuth("MiniMax CN API key", ["MINIMAX_CN_API_KEY"]) },
    models: Object.values(MINIMAX_CN_MODELS),
    api: openAICompletionsApi(),
  });
}
