import {
  createProvider,
  envApiKeyAuth,
  type Model,
  type Provider,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { DEEPSEEK_MODELS } from "@earendil-works/pi-ai/providers/deepseek.models";

type DeepSeekApi = "openai-completions" | "openai-responses";

export function deepseekProvider(): Provider<DeepSeekApi> {
  const models = Object.values(DEEPSEEK_MODELS).map((model) => {
    if (model.id !== "deepseek-v4-flash") {
      return model;
    }
    return {
      ...model,
      api: "openai-responses",
      compat: {
        supportsDeveloperRole: false,
        supportsLongCacheRetention: false,
        sessionAffinityFormat: "openai-nosession",
      },
    } satisfies Model<"openai-responses">;
  });

  return createProvider<DeepSeekApi>({
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    auth: {
      apiKey: envApiKeyAuth("DeepSeek API key", ["DEEPSEEK_API_KEY"]),
    },
    models,
    api: {
      "openai-completions": openAICompletionsApi(),
      "openai-responses": openAIResponsesApi(),
    },
  });
}
