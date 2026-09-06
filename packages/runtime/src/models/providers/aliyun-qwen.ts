import {
  createProvider,
  envApiKeyAuth,
  type Provider,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

import {
  ALIYUN_QWEN_BASE_URL,
  ALIYUN_QWEN_MODELS,
} from "./aliyun-qwen.models";

export function aliyunQwenProvider(): Provider<"openai-completions"> {
  return createProvider({
    id: "aliyun-qwen",
    name: "Aliyun Qwen",
    baseUrl: ALIYUN_QWEN_BASE_URL,
    auth: {
      apiKey: envApiKeyAuth("DashScope API key", ["DASHSCOPE_API_KEY"]),
    },
    models: Object.values(ALIYUN_QWEN_MODELS),
    api: openAICompletionsApi(),
  });
}
