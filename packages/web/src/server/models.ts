import {
  createModels,
  createProvider,
  envApiKeyAuth,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import type { ModelConfig } from "@llm-space/core";

export const availableModels = setupModels();

export function getDefaultModelConfig(): Pick<ModelConfig, "id" | "provider"> {
  const firstModel = availableModels.getProviders()[0]?.getModels()[0];
  if (!firstModel) {
    throw new Error("No models configured");
  }
  return { provider: firstModel.provider, id: firstModel.id };
}

function setupModels() {
  const arkProvider = createProvider({
    id: "ark",
    name: "VolcEngine Ark",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    auth: {
      apiKey: envApiKeyAuth("ARK_API_KEY", ["ARK_API_KEY"]),
    },
    models: [
      {
        id: "doubao-seed-2-1-pro-260628",
        provider: "ark",
        name: "Doubao-Seed-2.1-pro",
        api: "openai-completions",
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 262144,
        maxTokens: 262144,
        compat: {
          supportsDeveloperRole: false,
        },
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
      },
      {
        id: "doubao-seed-2-1-turbo-260628",
        provider: "ark",
        name: "Doubao-Seed-2.1-turbo",
        api: "openai-completions",
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 262144,
        maxTokens: 262144,
        compat: {
          supportsDeveloperRole: false,
        },
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
      },
      {
        id: "doubao-seed-2-1-evolving",
        provider: "ark",
        name: "Doubao-Seed-Evolving",
        api: "openai-completions",
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 262144,
        maxTokens: 262144,
        compat: {
          supportsDeveloperRole: false,
        },
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
      },
    ],
    api: openAICompletionsApi(),
  });
  const arkCodingPlanProvider = createProvider({
    id: "ark-coding-plan",
    name: "VolcEngine Ark - Coding Plan",
    baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
    auth: {
      apiKey: envApiKeyAuth("ARK_API_KEY", ["ARK_API_KEY"]),
    },
    models: [
      {
        id: "doubao-seed-2.0-code",
        provider: "ark-coding-plan",
        name: "Doubao-Seed-2.0-code",
        api: "openai-completions",
        baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 262144,
        maxTokens: 262144,
        compat: {
          supportsDeveloperRole: false,
        },
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
      },
      {
        id: "doubao-seed-2.0-pro",
        provider: "ark-coding-plan",
        name: "Doubao-Seed-2.0-pro",
        api: "openai-completions",
        baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 262144,
        maxTokens: 262144,
        compat: {
          supportsDeveloperRole: false,
        },
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
      },
      {
        id: "deepseek-v4-pro",
        provider: "ark-coding-plan",
        name: "DeepSeek V4 Pro",
        api: "openai-completions",
        baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
        reasoning: true,
        input: ["text"],
        contextWindow: 1000000,
        maxTokens: 384000,
        compat: {
          supportsDeveloperRole: false,
        },
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
      },
      {
        id: "deepseek-v4-flash",
        provider: "ark-coding-plan",
        name: "DeepSeek V4 Flash",
        api: "openai-completions",
        baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
        reasoning: true,
        input: ["text"],
        contextWindow: 1000000,
        maxTokens: 384000,
        compat: {
          supportsDeveloperRole: false,
        },
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
      },
      {
        id: "glm-5.2",
        provider: "ark-coding-plan",
        name: "GLM-5.2",
        api: "openai-completions",
        baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
        reasoning: true,
        input: ["text"],
        contextWindow: 1000000,
        maxTokens: 131072,
        compat: {
          supportsDeveloperRole: false,
        },
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
      },
      {
        id: "kimi-k2.7-code",
        provider: "ark-coding-plan",
        name: "Kimi K2.7 Code",
        api: "openai-completions",
        baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 262144,
        maxTokens: 262144,
        compat: {
          supportsDeveloperRole: false,
        },
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
      },
      {
        id: "minimax-m3",
        provider: "ark-coding-plan",
        name: "Minimax M3",
        api: "openai-completions",
        baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 512000,
        maxTokens: 128000,
        compat: {
          supportsDeveloperRole: false,
        },
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
      },
    ],
    api: openAICompletionsApi(),
  });
  const arkForAuroraProvider = createProvider({
    id: "ark",
    name: "VolcEngine Ark for Aurora",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    auth: {
      apiKey: envApiKeyAuth("AURORA_ARK_API_KEY", ["AURORA_ARK_API_KEY"]),
    },
    models: [
      {
        id: "ep-20260615220137-zw7qb",
        provider: "ark",
        name: "Oneloop-1.0",
        api: "openai-completions",
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 262144,
        maxTokens: 262144,
        compat: {
          supportsDeveloperRole: false,
        },
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
      },
    ],
    api: openAICompletionsApi(),
  });

  const models = createModels();
  models.setProvider(deepseekProvider());
  models.setProvider(openaiCodexProvider());
  models.setProvider(arkProvider);
  models.setProvider(arkCodingPlanProvider);
  models.setProvider(arkForAuroraProvider);
  return models;
}
