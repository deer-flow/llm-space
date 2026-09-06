import type { ModelProviderGroup } from "@llm-space/core";

import type { AppLanguage } from "@/shared/language";

/**
 * Localized display names for bundled providers. Provider ids, saved settings,
 * and user-defined provider names deliberately remain untouched.
 *
 * Add a provider id here when a regional product name differs from the name
 * returned by its SDK. Unknown (including custom/plugin) providers fall back
 * to their configured name.
 */
const BUILTIN_PROVIDER_DISPLAY_NAMES: Partial<
  Record<AppLanguage, Record<string, string>>
> = {
  zh: {
    "aliyun-qwen": "阿里云千问 AI 平台",
    ark: "火山引擎",
    "ark-agent-plan": "火山引擎",
    "ark-coding-plan": "火山引擎",
    minimax: "MiniMax",
    "minimax-cn": "MiniMax（国内）",
    moonshotai: "月之暗面",
    "moonshotai-cn": "月之暗面（国内）",
    zai: "智普",
    "zai-coding-cn": "智普 Coding（国内）",
  },
};

export function providerDisplayName(
  provider: Pick<ModelProviderGroup, "id" | "name">,
  language: AppLanguage
): string {
  return (
    BUILTIN_PROVIDER_DISPLAY_NAMES[language]?.[provider.id] ?? provider.name
  );
}
