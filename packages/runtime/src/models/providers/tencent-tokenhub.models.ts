import type { Model } from "@earendil-works/pi-ai";

export const TENCENT_TOKENHUB_BASE_URL =
  "https://tokenhub.tencentmaas.com/v1";

const UNKNOWN_USD_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
} as const;

const TOKENHUB_COMPAT = {
  supportsDeveloperRole: false,
  supportsStore: false,
  supportsReasoningEffort: false,
  supportsLongCacheRetention: false,
  maxTokensField: "max_tokens",
  thinkingFormat: "deepseek",
} as const;

interface TokenHubModelOptions {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
  input?: ("text" | "image")[];
  reasoning?: boolean;
  canDisableThinking?: boolean;
  requiresReasoningReplay?: boolean;
}

function tokenHubModel({
  id,
  name,
  contextWindow,
  maxTokens,
  input = ["text"],
  reasoning = true,
  canDisableThinking = true,
  requiresReasoningReplay = false,
}: TokenHubModelOptions): Model<"openai-completions"> {
  return {
    id,
    provider: "tencent-tokenhub",
    name,
    api: "openai-completions",
    baseUrl: TENCENT_TOKENHUB_BASE_URL,
    reasoning,
    ...(reasoning && !canDisableThinking
      ? { thinkingLevelMap: { off: null } }
      : {}),
    input,
    cost: UNKNOWN_USD_COST,
    contextWindow,
    maxTokens,
    compat: {
      ...TOKENHUB_COMPAT,
      ...(requiresReasoningReplay
        ? { requiresReasoningContentOnAssistantMessages: true }
        : {}),
    },
  };
}

/**
 * Current featured TokenHub language and visual-understanding models.
 *
 * TokenHub also exposes image/video/3D generation, speech, and embedding
 * models through other APIs. Those intentionally do not belong in LLM Space's
 * chat-model catalog. Prices remain zero because pi-ai records USD rates while
 * TokenHub publishes CNY pricing and subscription-plan accounting.
 */
export const TENCENT_TOKENHUB_MODELS = {
  "hy4-preview": tokenHubModel({
    id: "hy4-preview",
    name: "Hy4 Preview",
    contextWindow: 1_024_000,
    maxTokens: 64_000,
  }),
  hy3: tokenHubModel({
    id: "hy3",
    name: "Hy3",
    contextWindow: 256_000,
    maxTokens: 128_000,
  }),
  "hy-mt2-pro": tokenHubModel({
    id: "hy-mt2-pro",
    name: "Hy-MT2-Pro",
    contextWindow: 8_192,
    maxTokens: 4_096,
    reasoning: false,
  }),
  "hy-mt2-plus": tokenHubModel({
    id: "hy-mt2-plus",
    name: "Hy-MT2-Plus",
    contextWindow: 8_192,
    maxTokens: 4_096,
    reasoning: false,
  }),
  "hy-mt2-lite": tokenHubModel({
    id: "hy-mt2-lite",
    name: "Hy-MT2-Lite",
    contextWindow: 8_192,
    maxTokens: 4_096,
    reasoning: false,
  }),
  "hunyuan-role-latest": tokenHubModel({
    id: "hunyuan-role-latest",
    name: "Hy-Role-Latest",
    contextWindow: 32_768,
    maxTokens: 4_096,
    reasoning: false,
  }),
  "hy-role": tokenHubModel({
    id: "hy-role",
    name: "Hy-Role",
    contextWindow: 32_768,
    maxTokens: 4_096,
    reasoning: false,
  }),
  "deepseek-v4-flash-202605": tokenHubModel({
    id: "deepseek-v4-flash-202605",
    name: "DeepSeek V4 Flash (Direct)",
    contextWindow: 1_000_000,
    maxTokens: 393_216,
    requiresReasoningReplay: true,
  }),
  "deepseek-v4-pro-202606": tokenHubModel({
    id: "deepseek-v4-pro-202606",
    name: "DeepSeek V4 Pro (Direct)",
    contextWindow: 1_000_000,
    maxTokens: 393_216,
    requiresReasoningReplay: true,
  }),
  "deepseek/deepseek-v4-flash-0731": tokenHubModel({
    id: "deepseek/deepseek-v4-flash-0731",
    name: "DeepSeek V4 Flash 0731 (Direct)",
    contextWindow: 1_000_000,
    maxTokens: 393_216,
    requiresReasoningReplay: true,
  }),
  "deepseek/deepseek-v4-flash": tokenHubModel({
    id: "deepseek/deepseek-v4-flash",
    name: "DeepSeek V4 Flash (Direct Alias)",
    contextWindow: 1_000_000,
    maxTokens: 393_216,
    requiresReasoningReplay: true,
  }),
  "deepseek/deepseek-v4-pro-0813": tokenHubModel({
    id: "deepseek/deepseek-v4-pro-0813",
    name: "DeepSeek V4 Pro 0813 (Direct)",
    contextWindow: 1_000_000,
    maxTokens: 393_216,
    requiresReasoningReplay: true,
  }),
  "deepseek/deepseek-v4-pro": tokenHubModel({
    id: "deepseek/deepseek-v4-pro",
    name: "DeepSeek V4 Pro (Direct Alias)",
    contextWindow: 1_000_000,
    maxTokens: 393_216,
    requiresReasoningReplay: true,
  }),
  "deepseek/deepseek-v4-flash-vision-exp": tokenHubModel({
    id: "deepseek/deepseek-v4-flash-vision-exp",
    name: "DeepSeek V4 Flash Vision Exp (Direct)",
    contextWindow: 1_000_000,
    maxTokens: 393_216,
    input: ["text", "image"],
    requiresReasoningReplay: true,
  }),
  "deepseek-v4-flash-0731": tokenHubModel({
    id: "deepseek-v4-flash-0731",
    name: "DeepSeek V4 Flash 0731",
    contextWindow: 1_000_000,
    maxTokens: 393_216,
    requiresReasoningReplay: true,
  }),
  "deepseek-v4-pro-0813": tokenHubModel({
    id: "deepseek-v4-pro-0813",
    name: "DeepSeek V4 Pro 0813",
    contextWindow: 1_000_000,
    maxTokens: 393_216,
    requiresReasoningReplay: true,
  }),
  "deepseek-v4-flash": tokenHubModel({
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    contextWindow: 1_000_000,
    maxTokens: 393_216,
    requiresReasoningReplay: true,
  }),
  "deepseek-v4-pro": tokenHubModel({
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    contextWindow: 1_000_000,
    maxTokens: 393_216,
    requiresReasoningReplay: true,
  }),
  "glm-5.3": tokenHubModel({
    id: "glm-5.3",
    name: "GLM-5.3",
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    canDisableThinking: false,
  }),
  "glm-5.3-flash": tokenHubModel({
    id: "glm-5.3-flash",
    name: "GLM-5.3 Flash",
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    input: ["text", "image"],
    canDisableThinking: false,
  }),
  "glm-5.2": tokenHubModel({
    id: "glm-5.2",
    name: "GLM-5.2",
    contextWindow: 204_800,
    maxTokens: 131_072,
  }),
  "glm-5.1": tokenHubModel({
    id: "glm-5.1",
    name: "GLM-5.1",
    contextWindow: 204_800,
    maxTokens: 131_072,
  }),
  "glm-5v-turbo": tokenHubModel({
    id: "glm-5v-turbo",
    name: "GLM-5V Turbo",
    contextWindow: 131_072,
    maxTokens: 32_768,
    input: ["text", "image"],
  }),
  "glm-5-turbo": tokenHubModel({
    id: "glm-5-turbo",
    name: "GLM-5 Turbo",
    contextWindow: 204_800,
    maxTokens: 131_072,
  }),
  "glm-5": tokenHubModel({
    id: "glm-5",
    name: "GLM-5",
    contextWindow: 204_800,
    maxTokens: 131_072,
  }),
  "kimi-k3": tokenHubModel({
    id: "kimi-k3",
    name: "Kimi K3",
    contextWindow: 1_048_576,
    maxTokens: 1_048_576,
    input: ["text", "image"],
    canDisableThinking: false,
    requiresReasoningReplay: true,
  }),
  "kimi-k2.7-code": tokenHubModel({
    id: "kimi-k2.7-code",
    name: "Kimi K2.7 Code",
    contextWindow: 262_144,
    maxTokens: 262_144,
    input: ["text", "image"],
    canDisableThinking: false,
    requiresReasoningReplay: true,
  }),
  "kimi-k2.7-code-highspeed": tokenHubModel({
    id: "kimi-k2.7-code-highspeed",
    name: "Kimi K2.7 Code HighSpeed",
    contextWindow: 262_144,
    maxTokens: 262_144,
    input: ["text", "image"],
    canDisableThinking: false,
    requiresReasoningReplay: true,
  }),
  "kimi-k2.6": tokenHubModel({
    id: "kimi-k2.6",
    name: "Kimi K2.6",
    contextWindow: 262_144,
    maxTokens: 262_144,
    input: ["text", "image"],
    requiresReasoningReplay: true,
  }),
  "kimi-k2.5": tokenHubModel({
    id: "kimi-k2.5",
    name: "Kimi K2.5",
    contextWindow: 262_144,
    maxTokens: 262_144,
    requiresReasoningReplay: true,
  }),
  "minimax-m3": tokenHubModel({
    id: "minimax-m3",
    name: "MiniMax-M3",
    contextWindow: 1_000_000,
    maxTokens: 128_000,
    input: ["text", "image"],
  }),
  "minimax-m2.7": tokenHubModel({
    id: "minimax-m2.7",
    name: "MiniMax-M2.7",
    contextWindow: 204_800,
    maxTokens: 131_072,
    canDisableThinking: false,
  }),
  "qwen3.5-plus": tokenHubModel({
    id: "qwen3.5-plus",
    name: "Qwen3.5 Plus",
    contextWindow: 1_000_000,
    maxTokens: 131_072,
    input: ["text", "image"],
  }),
  "qwen3.5-flash": tokenHubModel({
    id: "qwen3.5-flash",
    name: "Qwen3.5 Flash",
    contextWindow: 1_000_000,
    maxTokens: 131_072,
    input: ["text", "image"],
  }),
  "mimo-v2.5-pro": tokenHubModel({
    id: "mimo-v2.5-pro",
    name: "MiMo-V2.5-Pro",
    contextWindow: 262_144,
    maxTokens: 131_072,
  }),
  "youtu-vita": tokenHubModel({
    id: "youtu-vita",
    name: "YT-VITA",
    contextWindow: 131_072,
    maxTokens: 32_768,
    input: ["text", "image"],
    reasoning: false,
  }),
  "hy-vision-2.0-instruct": tokenHubModel({
    id: "hy-vision-2.0-instruct",
    name: "HY-Vision-2.0-Instruct",
    contextWindow: 131_072,
    maxTokens: 32_768,
    input: ["text", "image"],
    reasoning: false,
  }),
  "hunyuan-t1-vision-20250916": tokenHubModel({
    id: "hunyuan-t1-vision-20250916",
    name: "HY-Vision-1.5-Thinking",
    contextWindow: 131_072,
    maxTokens: 32_768,
    input: ["text", "image"],
  }),
} satisfies Record<string, Model<"openai-completions">>;
