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

/**
 * DeepSeek V4.1 Flash intermediate-version preview (opened 2026-09-08,
 * expires 2026-09-10 — the id suffix is the deadline). New architecture with
 * native multimodal (text + image) input; pricing matches deepseek-v4-flash
 * and each account is rate-limited to 20 concurrent requests. Announced after
 * the upstream pi-ai catalog shipped, so it is declared here on the
 * OpenAI-compatible completions endpoint (the preview has not announced
 * Responses-API support).
 */
const DEEPSEEK_V41_FLASH_PREVIEW: Model<"openai-completions"> = {
  id: "deepseek-v4.1-flash-expires-on-0910",
  name: "DeepSeek V4.1 Flash Preview",
  api: "openai-completions",
  baseUrl: "https://api.deepseek.com",
  provider: "deepseek",
  reasoning: true,
  input: ["text", "image"],
  cost: {
    input: 0.14,
    output: 0.28,
    cacheRead: 0.0028,
    cacheWrite: 0,
  },
  contextWindow: 1_000_000,
  maxTokens: 384_000,
  compat: {
    supportsStore: false,
    supportsDeveloperRole: false,
    maxTokensField: "max_tokens",
    requiresReasoningContentOnAssistantMessages: true,
    thinkingFormat: "deepseek",
  },
  thinkingLevelMap: {
    minimal: null,
    low: "low",
    medium: null,
    high: "high",
    max: "max",
  },
};

export function deepseekProvider(): Provider<DeepSeekApi> {
  const models = [
    ...Object.values(DEEPSEEK_MODELS).map((model) => {
      if (
        model.id !== "deepseek-v4-flash" &&
        model.id !== "deepseek-v4-pro"
      ) {
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
    }),
    DEEPSEEK_V41_FLASH_PREVIEW,
  ];

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
