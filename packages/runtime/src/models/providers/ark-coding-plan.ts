import {
  createProvider,
  envApiKeyAuth,
  type Provider,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

import { ARK_CODING_PLAN_MODELS } from "./ark-coding-plan.models";

export function arkCodingPlanProvider(): Provider<"openai-completions"> {
  return createProvider({
    id: "ark-coding-plan",
    name: "VolcEngine Ark - Coding Plan",
    baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
    auth: {
      apiKey: envApiKeyAuth("ARK_API_KEY", [
        "ARK_CODING_PLAN_API_KEY",
        "ARK_API_KEY",
      ]),
    },
    models: Object.values(ARK_CODING_PLAN_MODELS),
    api: openAICompletionsApi(),
  });
}
