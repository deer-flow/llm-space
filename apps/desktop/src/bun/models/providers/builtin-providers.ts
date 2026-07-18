import { type Provider } from "@earendil-works/pi-ai";
import { amazonBedrockProvider } from "@earendil-works/pi-ai/providers/amazon-bedrock";
import { antLingProvider } from "@earendil-works/pi-ai/providers/ant-ling";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { azureOpenAIResponsesProvider } from "@earendil-works/pi-ai/providers/azure-openai-responses";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";
import { groqProvider } from "@earendil-works/pi-ai/providers/groq";
import { huggingfaceProvider } from "@earendil-works/pi-ai/providers/huggingface";
import { minimaxProvider } from "@earendil-works/pi-ai/providers/minimax";
import { minimaxCnProvider } from "@earendil-works/pi-ai/providers/minimax-cn";
import { moonshotaiProvider } from "@earendil-works/pi-ai/providers/moonshotai";
import { moonshotaiCnProvider } from "@earendil-works/pi-ai/providers/moonshotai-cn";
import { nvidiaProvider } from "@earendil-works/pi-ai/providers/nvidia";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { vercelAIGatewayProvider } from "@earendil-works/pi-ai/providers/vercel-ai-gateway";
import { xaiProvider } from "@earendil-works/pi-ai/providers/xai";
import { xiaomiProvider } from "@earendil-works/pi-ai/providers/xiaomi";
import { zaiProvider } from "@earendil-works/pi-ai/providers/zai";
import { zaiCodingCnProvider } from "@earendil-works/pi-ai/providers/zai-coding-cn";

import { arkProvider } from "./ark";
import { arkAgentPlanProvider } from "./ark-agent-plan";
import { arkCodingPlanProvider } from "./ark-coding-plan";
import { openaiCodexProvider } from "./openai-codex";

/** Static, non-`Provider` metadata for a builtin provider. */
export interface BuiltinProviderMeta {
  /** The provider's public homepage. Optional — omitted when uncertain. */
  websiteLink?: string;
}

/**
 * Supplementary metadata for the builtin providers, keyed by provider id.
 * `websiteLink` is filled only where the URL is known with confidence.
 */
export const BUILTIN_PROVIDER_META: Record<string, BuiltinProviderMeta> = {
  "amazon-bedrock": { websiteLink: "https://aws.amazon.com/bedrock/" },
  "ant-ling": { websiteLink: "https://www.ant-ling.com/" },
  anthropic: { websiteLink: "https://claude.com/platform/api" },
  ark: { websiteLink: "https://www.volcengine.com/product/ark" },
  "ark-agent-plan": {
    websiteLink:
      "https://ai.volcengine.com/activity/agentplan?utm_campaign=LLM_Space&utm_content=LLM_Space&utm_medium=devrel&utm_source=OWO&utm_term=LLM_Space",
  },
  "ark-coding-plan": {
    websiteLink:
      "https://www.volcengine.com/activity/codingplan?utm_campaign=deer_flow&utm_content=deer_flow&utm_medium=devrel&utm_source=OWO&utm_term=deer_flow",
  },
  "azure-openai-responses": {
    websiteLink:
      "https://azure.microsoft.com/en-us/products/ai-services/openai-service",
  },
  deepseek: { websiteLink: "https://www.deepseek.com" },
  google: { websiteLink: "https://ai.google.dev" },
  groq: { websiteLink: "https://groq.com" },
  huggingface: { websiteLink: "https://huggingface.co" },
  minimax: { websiteLink: "https://www.minimax.io" },
  "minimax-cn": { websiteLink: "https://www.minimaxi.com" },
  moonshotai: { websiteLink: "https://www.moonshot.ai" },
  "moonshotai-cn": { websiteLink: "https://www.moonshot.cn" },
  nvidia: { websiteLink: "https://build.nvidia.com" },
  openai: { websiteLink: "https://openai.com" },
  "openai-codex": { websiteLink: "https://openai.com/codex" },
  openrouter: { websiteLink: "https://openrouter.ai" },
  "vercel-ai-gateway": { websiteLink: "https://vercel.com/ai-gateway" },
  xai: { websiteLink: "https://x.ai" },
  xiaomi: { websiteLink: "https://mimo.xiaomi.com/zh" },
  zai: { websiteLink: "https://z.ai" },
  "zai-coding-cn": { websiteLink: "https://z.ai/subscribe" },
};

/** Factory for each builtin provider, keyed by provider id. */
export const BUILTIN_PROVIDERS: Record<string, Provider> = {
  "amazon-bedrock": amazonBedrockProvider(),
  "ant-ling": antLingProvider(),
  anthropic: anthropicProvider(),
  ark: arkProvider(),
  "ark-agent-plan": arkAgentPlanProvider(),
  "ark-coding-plan": arkCodingPlanProvider(),
  "azure-openai-responses": azureOpenAIResponsesProvider(),
  deepseek: deepseekProvider(),
  google: googleProvider(),
  groq: groqProvider(),
  huggingface: huggingfaceProvider(),
  minimax: minimaxProvider(),
  "minimax-cn": minimaxCnProvider(),
  moonshotai: moonshotaiProvider(),
  "moonshotai-cn": moonshotaiCnProvider(),
  nvidia: nvidiaProvider(),
  openai: openaiProvider(),
  "openai-codex": openaiCodexProvider(),
  openrouter: openrouterProvider(),
  "vercel-ai-gateway": vercelAIGatewayProvider(),
  xai: xaiProvider(),
  xiaomi: xiaomiProvider(),
  zai: zaiProvider(),
  "zai-coding-cn": zaiCodingCnProvider(),
};
