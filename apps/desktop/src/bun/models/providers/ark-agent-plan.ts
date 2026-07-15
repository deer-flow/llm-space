import {
  createProvider,
  envApiKeyAuth,
  type Provider,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

import { ARK_AGENT_PLAN_MODELS } from "./ark-agent-plan.models";

export function arkAgentPlanProvider(): Provider<"openai-completions"> {
  return createProvider({
    id: "ark-agent-plan",
    name: "VolcEngine Ark - Agent Plan",
    baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
    auth: {
      apiKey: envApiKeyAuth("ARK_API_KEY", [
        "ARK_AGENT_PLAN_API_KEY",
        "ARK_API_KEY",
      ]),
    },
    models: Object.values(ARK_AGENT_PLAN_MODELS),
    api: openAICompletionsApi(),
  });
}
