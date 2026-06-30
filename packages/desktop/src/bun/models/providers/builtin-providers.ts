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
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { vercelAIGatewayProvider } from "@earendil-works/pi-ai/providers/vercel-ai-gateway";
import { xaiProvider } from "@earendil-works/pi-ai/providers/xai";
import { xiaomiProvider } from "@earendil-works/pi-ai/providers/xiaomi";
import { zaiProvider } from "@earendil-works/pi-ai/providers/zai";
import { zaiCodingCnProvider } from "@earendil-works/pi-ai/providers/zai-coding-cn";

import { arkProvider } from "./ark";
import { arkCodingPlanProvider } from "./ark-coding-plan";

/** Factory for each builtin provider, keyed by provider id. */
export const BUILTIN_PROVIDERS: Record<string, Provider> = {
  "amazon-bedrock": amazonBedrockProvider(),
  "ant-ling": antLingProvider(),
  anthropic: anthropicProvider(),
  ark: arkProvider(),
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
