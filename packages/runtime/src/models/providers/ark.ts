import {
  createProvider,
  envApiKeyAuth,
  type Provider,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

import { ARK_MODELS } from "./ark.models";

export function arkProvider(): Provider<"openai-completions"> {
  return createProvider({
    id: "ark",
    name: "VolcEngine Ark",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    auth: { apiKey: envApiKeyAuth("ARK_API_KEY", ["ARK_API_KEY"]) },
    models: Object.values(ARK_MODELS),
    api: openAICompletionsApi(),
  });
}
