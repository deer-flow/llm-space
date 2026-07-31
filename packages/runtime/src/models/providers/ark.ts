import {
  createProvider,
  envApiKeyAuth,
  type Provider,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

import { ARK_MODELS } from "./ark.models";

export const ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export function arkProvider(): Provider<"openai-completions"> {
  return createProvider({
    id: "ark",
    name: "VolcEngine Ark",
    baseUrl: ARK_BASE_URL,
    auth: { apiKey: envApiKeyAuth("ARK_API_KEY", ["ARK_API_KEY"]) },
    models: Object.values(ARK_MODELS),
    api: openAICompletionsApi(),
  });
}
