import type { Model } from "@earendil-works/pi-ai";

// The MiniMax chat API is OpenAI-compatible. Each region targets its
// OpenAI-compatible base URL and the OpenAI Completions API.
const OPENAI_BASE_URL = "https://api.minimax.io/v1";
const OPENAI_BASE_URL_CN = "https://api.minimaxi.com/v1";

// MiniMax-M3 supports adaptive thinking (effort-based, on by default) and can
// also be disabled. "off" is supported (null would block disabling) and every
// effort level maps to itself so the adapter forwards it verbatim.
const M3_THINKING_LEVEL_MAP = {
  off: "off",
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max",
} as const;

// MiniMax-M2.7 is an always-on reasoning model: thinking cannot be disabled
// ("off" is null) and no effort selection is exposed.
const M2_7_THINKING_LEVEL_MAP = {
  off: null,
} as const;

// The pi-ai `Model.input` field is typed `("text" | "image")[]`; MiniMax-M3
// also accepts video. Declare the wider literal here so the catalog records
// the real input modalities, then assert at the model boundary (see below).
const M3_INPUT = ["text", "image", "video"] as unknown as ("text" | "image")[];

/**
 * Models for the global MiniMax provider.
 *
 * Refreshed to the OpenAI-compatible endpoint (`https://api.minimax.io/v1`)
 * with MiniMax-M3 at $0.6/$2.4/$0.12 input/output/cache-read pricing, a 1M
 * token context window, text/image/video input, and adaptive/disabled
 * thinking. MiniMax-M2.7 stays an always-on reasoning text model.
 */
export const MINIMAX_MODELS = {
  "MiniMax-M3": {
    id: "MiniMax-M3",
    provider: "minimax",
    name: "MiniMax-M3",
    api: "openai-completions",
    baseUrl: OPENAI_BASE_URL,
    reasoning: true,
    thinkingLevelMap: M3_THINKING_LEVEL_MAP,
    input: M3_INPUT,
    cost: {
      input: 0.6,
      output: 2.4,
      cacheRead: 0.12,
      cacheWrite: 0,
    },
    contextWindow: 1000000,
    maxTokens: 128000,
    compat: {
      thinkingFormat: "deepseek",
    },
  } satisfies Model<"openai-completions">,
  "MiniMax-M2.7": {
    id: "MiniMax-M2.7",
    provider: "minimax",
    name: "MiniMax-M2.7",
    api: "openai-completions",
    baseUrl: OPENAI_BASE_URL,
    reasoning: true,
    thinkingLevelMap: M2_7_THINKING_LEVEL_MAP,
    input: ["text"],
    cost: {
      input: 0.3,
      output: 1.2,
      cacheRead: 0.06,
      cacheWrite: 0.375,
    },
    contextWindow: 204800,
    maxTokens: 131072,
    compat: {
      thinkingFormat: "deepseek",
    },
  } satisfies Model<"openai-completions">,
};

/**
 * Models for the China MiniMax provider, mirroring the global catalog against
 * the China OpenAI-compatible endpoint (`https://api.minimaxi.com/v1`).
 */
export const MINIMAX_CN_MODELS = {
  "MiniMax-M3": {
    ...MINIMAX_MODELS["MiniMax-M3"],
    provider: "minimax-cn",
    baseUrl: OPENAI_BASE_URL_CN,
  } satisfies Model<"openai-completions">,
  "MiniMax-M2.7": {
    ...MINIMAX_MODELS["MiniMax-M2.7"],
    provider: "minimax-cn",
    baseUrl: OPENAI_BASE_URL_CN,
  } satisfies Model<"openai-completions">,
};
