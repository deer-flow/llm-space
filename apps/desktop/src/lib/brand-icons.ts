import {
  Ai21,
  Anthropic,
  AntGroup,
  Azure,
  Baichuan,
  Bedrock,
  ChatGLM,
  Claude,
  Cohere,
  DeepSeek,
  Doubao,
  Gemini,
  Gemma,
  Google,
  Grok,
  Groq,
  HuggingFace,
  Hunyuan,
  Meta,
  Microsoft,
  Minimax,
  Mistral,
  Moonshot,
  Nvidia,
  Ollama,
  OpenAI,
  OpenRouter,
  Perplexity,
  Qwen,
  Spark,
  Stepfun,
  Vercel,
  Volcengine,
  Wenxin,
  XAI,
  Yi,
  Zhipu,
} from "@lobehub/icons";
import type { CSSProperties, ComponentType } from "react";

/** The subset of props our avatars pass to a resolved brand icon component. */
export type BrandIconComponent = ComponentType<{
  size?: number;
  className?: string;
  style?: CSSProperties;
}>;

/**
 * A resolved brand icon: the React component to render (colored variant when the
 * brand ships one, else the base monochrome icon that inherits the current text
 * color) plus any default props the mapping carries.
 */
export interface BrandIcon {
  Icon: BrandIconComponent;
  props?: Record<string, unknown>;
}

/**
 * A `@lobehub/icons` icon component: a base (monochrome) component with an
 * optional colored variant hung off `.Color`.
 */
type LobeIcon = BrandIconComponent & { Color?: BrandIconComponent };

/** One entry of our curated icon vocabulary: a brand icon plus its keywords. */
interface IconMapping {
  Icon: BrandIconComponent;
  keywords: string[];
}

/**
 * Curated subset of `@lobehub/icons` covering our builtin providers and the
 * common model families, imported by name so the bundle only ships the icons we
 * actually reference (the full library's `providerMappings`/`modelMappings`
 * statically pull in every brand, ~570 kB gzipped). Custom providers/models with
 * no match here fall back to the initials avatar.
 *
 * The keyword lists are transcribed verbatim from the pinned library's own
 * mappings — `@lobehub/icons@5.10.1`, `es/features/{provider,model}Config.js` —
 * so resolution behaves identically for the brands we keep. On a library bump,
 * re-diff against those two files to pick up renamed/added keywords (a drift
 * here silently degrades to the initials avatar, never an error). Provider
 * keywords are matched exactly; model keywords are regexes.
 */
const PROVIDER_MAPPINGS: IconMapping[] = [
  { Icon: AntGroup, keywords: ["antgroup"] },
  { Icon: Meta, keywords: ["meta"] },
  { Icon: Microsoft, keywords: ["microsoft"] },
  { Icon: Zhipu, keywords: ["zhipu", "glmcodingplan"] },
  { Icon: Bedrock, keywords: ["bedrock"] },
  { Icon: DeepSeek, keywords: ["deepseek"] },
  { Icon: Google, keywords: ["google"] },
  { Icon: Azure, keywords: ["azure"] },
  { Icon: Moonshot, keywords: ["moonshot", "kimicodingplan"] },
  { Icon: OpenAI, keywords: ["openai"] },
  { Icon: Ollama, keywords: ["ollama", "ollamacloud"] },
  { Icon: Perplexity, keywords: ["perplexity"] },
  { Icon: Minimax, keywords: ["minimax", "minimaxcodingplan"] },
  { Icon: Mistral, keywords: ["mistral"] },
  { Icon: Anthropic, keywords: ["anthropic"] },
  { Icon: Groq, keywords: ["groq"] },
  { Icon: OpenRouter, keywords: ["openrouter"] },
  { Icon: Stepfun, keywords: ["stepfun", "stepfuncodingplan"] },
  { Icon: Spark, keywords: ["spark"] },
  { Icon: Baichuan, keywords: ["baichuan"] },
  { Icon: Ai21, keywords: ["ai21"] },
  { Icon: Doubao, keywords: ["doubao"] },
  { Icon: Hunyuan, keywords: ["hunyuan"] },
  { Icon: Nvidia, keywords: ["nvidia"] },
  { Icon: Wenxin, keywords: ["wenxin"] },
  { Icon: HuggingFace, keywords: ["huggingface"] },
  { Icon: XAI, keywords: ["xai"] },
  { Icon: Volcengine, keywords: ["volcengine", "volcenginecodingplan"] },
  { Icon: Cohere, keywords: ["cohere"] },
  { Icon: Vercel, keywords: ["vercel", "vercelaigateway", "v0"] },
];

// Model keywords are regexes tested against the model string; order matters
// (first match wins), so keep the more specific families ahead of broad ones.
const MODEL_MAPPINGS: IconMapping[] = [
  {
    Icon: OpenAI,
    keywords: [
      "gpt-3",
      "gpt-4",
      "gpt-5",
      "gpt-oss",
      "o1-",
      "^o1",
      "/o1",
      "o3-",
      "^o3",
      "/o3",
      "o4-",
      "^o4",
      "/o4",
      "codex",
      "davinci",
      "babbage",
      "text-embedding-",
      "tts-",
      "whisper-",
      "^gpt-",
      "/gpt-",
      "openai",
    ],
  },
  { Icon: ChatGLM, keywords: ["^glm-", "/glm-", "chatglm", "-glm-"] },
  { Icon: Claude, keywords: ["claude"] },
  { Icon: Anthropic, keywords: ["anthropic"] },
  {
    Icon: Nvidia,
    keywords: ["nemotron", "openreasoning", "nemoretriever", "neva-", "nv-"],
  },
  { Icon: Meta, keywords: ["llama", "/l3"] },
  { Icon: Gemini, keywords: ["gemini"] },
  { Icon: Gemma, keywords: ["gemma"] },
  { Icon: Moonshot, keywords: ["kimi", "moonshot"] },
  {
    Icon: Qwen,
    keywords: [
      "qwen",
      "qwq",
      "qvq",
      "wanx",
      "wan\\d/",
      "wan\\d\\.\\d-",
      "tongyi",
      "gte-rerank",
    ],
  },
  { Icon: Minimax, keywords: ["minimax", "abab"] },
  {
    Icon: Mistral,
    keywords: [
      "mistral",
      "mixtral",
      "codestral",
      "mathstral",
      "/mn-",
      "pixtral",
      "ministral",
      "magistral",
      "devstral",
      "voxtral",
    ],
  },
  { Icon: Perplexity, keywords: ["pplx", "sonar"] },
  { Icon: Yi, keywords: ["^yi-", "/yi-", "-yi-"] },
  { Icon: OpenRouter, keywords: ["^openrouter"] },
  { Icon: Cohere, keywords: ["command"] },
  { Icon: Stepfun, keywords: ["step"] },
  { Icon: Baichuan, keywords: ["baichuan"] },
  { Icon: Wenxin, keywords: ["ernie", "irag"] },
  { Icon: Doubao, keywords: ["^ep-", "doubao-"] },
  { Icon: Hunyuan, keywords: ["hunyuan"] },
  {
    Icon: Microsoft,
    keywords: ["wizardlm", "/phi-", "^phi-", "-phi-", "mai-", "microsoft"],
  },
  { Icon: Ai21, keywords: ["jamba", "^j2-", "ai21"] },
  { Icon: Grok, keywords: ["^grok-", "/grok-"] },
  { Icon: Spark, keywords: ["spark"] },
  { Icon: DeepSeek, keywords: ["deepseek"] },
  { Icon: Google, keywords: ["google", "learnlm", "nano-banana"] },
];

/**
 * Builtin provider ids whose `@lobehub/icons` keyword differs from their id and
 * display name, so auto-resolution would otherwise miss them. Used as an extra
 * resolution candidate for builtin providers; a user's explicit `icon` override
 * still takes precedence. Providers with no lobehub icon (e.g. xiaomi) are
 * omitted and fall back to the initials avatar.
 */
export const PROVIDER_ICON_ALIASES: Record<string, string> = {
  "amazon-bedrock": "bedrock",
  "ant-ling": "antgroup",
  ark: "volcengine",
  "ark-agent-plan": "volcengine",
  "ark-coding-plan": "volcengine",
  "azure-openai-responses": "azure",
  "minimax-cn": "minimax",
  moonshotai: "moonshot",
  "moonshotai-cn": "moonshot",
  "openai-codex": "openai",
  "vercel-ai-gateway": "vercel",
  zai: "zhipu",
  "zai-coding-cn": "zhipu",
};

/**
 * Build a {@link BrandIcon} from a mapping entry, preferring the colored variant
 * when the brand ships one (else the base monochrome icon that inherits the
 * current text color). The library types its icons loosely, so the single cast
 * to {@link LobeIcon} here is the only place we reach for the `.Color` static.
 */
function toBrandIcon(item: IconMapping): BrandIcon {
  const icon = item.Icon as LobeIcon;
  return { Icon: icon.Color ?? icon };
}

// Provider keywords are exact, static, and lowercase, so resolve them via a
// prebuilt keyword → resolved-icon map (O(1) per candidate) instead of scanning
// every mapping on each avatar render. Model keywords stay a linear regex scan
// (they need first-match-wins ordering), so only providers get this treatment.
const _providerIconByKeyword = new Map<string, BrandIcon>();
for (const item of PROVIDER_MAPPINGS) {
  const brand = toBrandIcon(item);
  for (const keyword of item.keywords) {
    _providerIconByKeyword.set(keyword, brand);
  }
}

// Keyword patterns come from a small, static vocabulary but are tested against
// every candidate on every avatar resolve, so compile each pattern once and
// reuse it. `null` marks a keyword that isn't a valid regex (matched by literal
// equality instead).
const _keywordRegexCache = new Map<string, RegExp | null>();

function matchesKeyword(keyword: string, value: string): boolean {
  // Only model keywords reach here (providers resolve via the exact-match map
  // above). They're regexes, so compile-and-test; fall back to a
  // case-insensitive equality check for any keyword that isn't a valid pattern.
  let regex = _keywordRegexCache.get(keyword);
  if (regex === undefined) {
    try {
      regex = new RegExp(keyword, "i");
    } catch {
      regex = null;
    }
    _keywordRegexCache.set(keyword, regex);
  }
  return regex
    ? regex.test(value)
    : keyword.toLowerCase() === value.toLowerCase();
}

/**
 * Resolve a provider brand icon from the first matching candidate. Provider
 * mappings match on an exact (case-insensitive) keyword, mirroring
 * `@lobehub/icons`' own `ProviderIcon`. Returns `null` when nothing matches so
 * callers can fall back to their own placeholder.
 */
export function resolveProviderIcon(
  ...candidates: (string | undefined)[]
): BrandIcon | null {
  for (const candidate of candidates) {
    const key = candidate?.trim().toLowerCase();
    if (!key) continue;
    const brand = _providerIconByKeyword.get(key);
    if (brand) return brand;
  }
  return null;
}

/**
 * Resolve a model brand icon from the first matching candidate. Model mappings
 * match via a case-insensitive regex over the model string (so an id like
 * `gpt-4o-mini` resolves to the GPT icon). Falls back to a provider brand icon —
 * a custom model with no model-specific mapping can still show its provider's
 * logo (e.g. `deepseek-v4` → DeepSeek). Returns `null` when nothing matches.
 */
export function resolveModelIcon(
  ...candidates: (string | undefined)[]
): BrandIcon | null {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) continue;
    for (const item of MODEL_MAPPINGS) {
      if (item.keywords.some((keyword) => matchesKeyword(keyword, value))) {
        return toBrandIcon(item);
      }
    }
  }
  return resolveProviderIcon(...candidates);
}
