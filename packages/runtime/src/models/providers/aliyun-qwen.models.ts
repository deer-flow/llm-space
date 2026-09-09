import type { Model } from "@earendil-works/pi-ai";

export const ALIYUN_QWEN_BASE_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1";

const UNKNOWN_USD_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
} as const;

const QWEN_3_8_THINKING_LEVEL_MAP = {
  off: "none",
  minimal: "low",
  low: "low",
  medium: "medium",
  high: "xhigh",
  xhigh: "xhigh",
  max: "xhigh",
} as const;

const DEEPSEEK_V4_THINKING_LEVEL_MAP = {
  off: "none",
  minimal: "low",
  low: "low",
  medium: "high",
  high: "high",
  xhigh: "max",
  max: "max",
} as const;

const GLM_5_3_THINKING_LEVEL_MAP = {
  off: null,
  minimal: "low",
  low: "low",
  medium: "high",
  high: "high",
  xhigh: "max",
  max: "max",
} as const;

const qwenCompat = {
  thinkingFormat: "qwen",
  supportsDeveloperRole: false,
  supportsStore: false,
  supportsReasoningEffort: true,
} as const;

/**
 * Models featured by the China (Beijing) DashScope OpenAI-compatible API.
 * Costs stay at zero because pi-ai's cost fields are USD-denominated while
 * DashScope publishes these models in CNY (and some plans use credits).
 */
export const ALIYUN_QWEN_MODELS = {
  "qwen3.8-max": {
    id: "qwen3.8-max",
    provider: "aliyun-qwen",
    name: "Qwen3.8 Max",
    api: "openai-completions",
    baseUrl: ALIYUN_QWEN_BASE_URL,
    reasoning: true,
    thinkingLevelMap: QWEN_3_8_THINKING_LEVEL_MAP,
    input: ["text", "image"],
    cost: UNKNOWN_USD_COST,
    contextWindow: 1_000_000,
    maxTokens: 131_072,
    compat: qwenCompat,
  } satisfies Model<"openai-completions">,
  "qwen3.7-plus": {
    id: "qwen3.7-plus",
    provider: "aliyun-qwen",
    name: "Qwen3.7 Plus",
    api: "openai-completions",
    baseUrl: ALIYUN_QWEN_BASE_URL,
    reasoning: true,
    input: ["text", "image"],
    cost: UNKNOWN_USD_COST,
    contextWindow: 1_000_000,
    maxTokens: 131_072,
    compat: {
      ...qwenCompat,
      supportsReasoningEffort: false,
    },
  } satisfies Model<"openai-completions">,
  "qwen3.8-flash": {
    id: "qwen3.8-flash",
    provider: "aliyun-qwen",
    name: "Qwen3.8 Flash",
    api: "openai-completions",
    baseUrl: ALIYUN_QWEN_BASE_URL,
    reasoning: true,
    thinkingLevelMap: QWEN_3_8_THINKING_LEVEL_MAP,
    input: ["text", "image"],
    cost: UNKNOWN_USD_COST,
    contextWindow: 1_000_000,
    maxTokens: 131_072,
    compat: qwenCompat,
  } satisfies Model<"openai-completions">,
  "deepseek-v4-pro-0813": {
    id: "deepseek-v4-pro-0813",
    provider: "aliyun-qwen",
    name: "DeepSeek V4 Pro 0813",
    api: "openai-completions",
    baseUrl: ALIYUN_QWEN_BASE_URL,
    reasoning: true,
    thinkingLevelMap: DEEPSEEK_V4_THINKING_LEVEL_MAP,
    input: ["text"],
    cost: UNKNOWN_USD_COST,
    contextWindow: 1_000_000,
    maxTokens: 393_216,
    compat: {
      ...qwenCompat,
      requiresReasoningContentOnAssistantMessages: true,
    },
  } satisfies Model<"openai-completions">,
  "deepseek-v4-flash-0731": {
    id: "deepseek-v4-flash-0731",
    provider: "aliyun-qwen",
    name: "DeepSeek V4 Flash 0731",
    api: "openai-completions",
    baseUrl: ALIYUN_QWEN_BASE_URL,
    reasoning: true,
    thinkingLevelMap: DEEPSEEK_V4_THINKING_LEVEL_MAP,
    input: ["text"],
    cost: UNKNOWN_USD_COST,
    contextWindow: 1_000_000,
    maxTokens: 393_216,
    compat: {
      ...qwenCompat,
      requiresReasoningContentOnAssistantMessages: true,
    },
  } satisfies Model<"openai-completions">,
  "kimi-k3": {
    id: "kimi-k3",
    provider: "aliyun-qwen",
    name: "Kimi K3",
    api: "openai-completions",
    baseUrl: ALIYUN_QWEN_BASE_URL,
    reasoning: true,
    thinkingLevelMap: { off: null },
    input: ["text", "image"],
    cost: UNKNOWN_USD_COST,
    contextWindow: 1_048_576,
    maxTokens: 1_048_576,
    compat: {
      ...qwenCompat,
      thinkingFormat: "openai",
      supportsReasoningEffort: false,
      requiresReasoningContentOnAssistantMessages: true,
    },
  } satisfies Model<"openai-completions">,
  "glm-5.3": {
    id: "glm-5.3",
    provider: "aliyun-qwen",
    name: "GLM-5.3",
    api: "openai-completions",
    baseUrl: ALIYUN_QWEN_BASE_URL,
    reasoning: true,
    thinkingLevelMap: GLM_5_3_THINKING_LEVEL_MAP,
    input: ["text"],
    cost: UNKNOWN_USD_COST,
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    compat: {
      ...qwenCompat,
      thinkingFormat: "openai",
    },
  } satisfies Model<"openai-completions">,
  "MiniMax-M3": {
    id: "MiniMax-M3",
    provider: "aliyun-qwen",
    name: "MiniMax-M3",
    api: "openai-completions",
    baseUrl: ALIYUN_QWEN_BASE_URL,
    reasoning: true,
    input: ["text", "image"],
    cost: UNKNOWN_USD_COST,
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    compat: {
      ...qwenCompat,
      thinkingFormat: "openai",
      supportsReasoningEffort: false,
    },
  } satisfies Model<"openai-completions">,
};
