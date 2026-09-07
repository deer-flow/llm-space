import {
  createProvider,
  envApiKeyAuth,
  type Provider,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

import {
  TENCENT_TOKENHUB_BASE_URL,
  TENCENT_TOKENHUB_MODELS,
} from "./tencent-tokenhub.models";

export function tencentTokenHubProvider(): Provider<"openai-completions"> {
  return createProvider({
    id: "tencent-tokenhub",
    name: "Tencent Token Hub",
    baseUrl: TENCENT_TOKENHUB_BASE_URL,
    auth: {
      apiKey: envApiKeyAuth("Tencent Token Hub API key", [
        "TOKENHUB_API_KEY",
        "TOKEN_HUB_API_KEY",
      ]),
    },
    models: Object.values(TENCENT_TOKENHUB_MODELS),
    api: openAICompletionsApi(),
  });
}
