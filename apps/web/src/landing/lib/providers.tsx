import type { ComponentType, CSSProperties } from "react";
import {
  Anthropic,
  AntGroup,
  Azure,
  Bedrock,
  DeepSeek,
  Google,
  Groq,
  HuggingFace,
  Minimax,
  Moonshot,
  Nvidia,
  OpenAI,
  OpenRouter,
  Vercel,
  Volcengine,
  XAI,
  Zhipu,
} from "@lobehub/icons";

/** The subset of props we pass to a `@lobehub/icons` brand icon. */
type IconProps = { size?: number; className?: string; style?: CSSProperties };

/**
 * A `@lobehub/icons` component: a base (monochrome, inherits `currentColor`)
 * icon with an optional colored variant hung off `.Color`.
 */
type LobeIcon = ComponentType<IconProps> & { Color?: ComponentType<IconProps> };

/** Prefer the brand's colored variant; fall back to the monochrome base. */
function colored(icon: LobeIcon): ComponentType<IconProps> {
  return icon.Color ?? icon;
}

export interface ProviderLogo {
  name: string;
  /** Brand icon; omitted for providers `@lobehub/icons` has no glyph for. */
  Icon?: ComponentType<IconProps>;
}

/**
 * Curated logos for the marquee — one entry per distinct brand behind the
 * builtin providers in `apps/desktop/.../builtin-providers.ts` (region/plan
 * variants like `minimax-cn`, `ark-coding-plan`, `openai-codex` collapse into
 * their parent brand). Icons resolve the same way the desktop app does
 * (`resolveProviderIcon` + `PROVIDER_ICON_ALIASES`): colored variant first,
 * monochrome base otherwise. Xiaomi has no lobehub glyph, so it renders as a
 * text chip.
 */
export const PROVIDERS: ProviderLogo[] = [
  { name: "OpenAI", Icon: colored(OpenAI) },
  { name: "Anthropic", Icon: colored(Anthropic) },
  { name: "Google", Icon: colored(Google) },
  { name: "xAI", Icon: colored(XAI) },
  { name: "DeepSeek", Icon: colored(DeepSeek) },
  { name: "Moonshot AI", Icon: colored(Moonshot) },
  { name: "MiniMax", Icon: colored(Minimax) },
  { name: "Z.ai", Icon: colored(Zhipu) },
  { name: "Groq", Icon: colored(Groq) },
  { name: "Amazon Bedrock", Icon: colored(Bedrock) },
  { name: "Azure OpenAI", Icon: colored(Azure) },
  { name: "NVIDIA", Icon: colored(Nvidia) },
  { name: "Volcengine Ark", Icon: colored(Volcengine) },
  { name: "OpenRouter", Icon: colored(OpenRouter) },
  { name: "Vercel AI Gateway", Icon: colored(Vercel) },
  { name: "Hugging Face", Icon: colored(HuggingFace) },
  { name: "Ant Ling", Icon: colored(AntGroup) },
  { name: "Xiaomi MiMo" },
];
