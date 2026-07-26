import type { ModelConfig, ModelProviderGroup } from "../types";

/**
 * The first enabled model across the configured providers, or `null` when none
 * are available. Providers are sorted by display name to match the model
 * selector's ordering.
 */
export function firstAvailableModel(
  providers: ModelProviderGroup[]
): ModelConfig | null {
  const sorted = [...providers].sort((a, b) => a.name.localeCompare(b.name));
  for (const group of sorted) {
    const disabled = new Set(group.disabledModels ?? []);
    const model = group.models.find((candidate) => !disabled.has(candidate.id));
    if (model) {
      return { provider: model.provider, id: model.id };
    }
  }
  return null;
}

/** Whether a model reference is still configured and enabled. */
export function isModelAvailable(
  providers: ModelProviderGroup[],
  ref: { provider: string; id: string }
): boolean {
  const group = providers.find((candidate) => candidate.id === ref.provider);
  if (!group?.models.some((model) => model.id === ref.id)) {
    return false;
  }
  return !(group.disabledModels ?? []).includes(ref.id);
}

/**
 * Resolve the model a thread should actually use: its available saved model,
 * the available user default, or the first available model.
 */
export function resolveModelConfig(
  providers: ModelProviderGroup[],
  saved: ModelConfig | null | undefined,
  defaultModel: ModelConfig | null
): ModelConfig | null {
  if (saved && isModelAvailable(providers, saved)) {
    return saved;
  }
  if (defaultModel && isModelAvailable(providers, defaultModel)) {
    return defaultModel;
  }
  return firstAvailableModel(providers);
}
