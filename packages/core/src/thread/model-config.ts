import type { ModelConfig, ModelProviderGroup } from "../types";

/** Models offered for new selections; the complete catalog still resolves saved IDs. */
export function selectableModels(group: ModelProviderGroup) {
  const disabled = new Set(group.disabledModels ?? []);
  const custom = new Set(group.customModels ?? []);
  const enabled = group.models.filter((model) => !disabled.has(model.id));
  if (!group.builtin) return enabled;

  // Match only MiniMax text IDs, including gateway namespaces. Do not infer
  // provider support for Flash, or filter user-defined models and media tools.
  const miniMaxId = (id: string) =>
    /^(?:[^/]+\/)*minimax[-/](?:m\d|text-\d|abab)[^/]*$/i.test(id);
  const supportedId = (id: string) =>
    /(?:^|[/-])m3(?:\.1-flash)?(?::free|-free)?$/i.test(id);
  const models = enabled.filter(
    (model) =>
      custom.has(model.id) || !miniMaxId(model.id) || supportedId(model.id)
  );
  // Reorder only MiniMax slots, preserving the order of other providers' models.
  const current = models
    .filter((model) => !custom.has(model.id) && miniMaxId(model.id))
    .sort(
      (a, b) =>
        Number(/m3\.1-flash(?::free|-free)?$/i.test(b.id)) -
        Number(/m3\.1-flash(?::free|-free)?$/i.test(a.id))
    );
  let index = 0;
  return models.map((model) =>
    !custom.has(model.id) && miniMaxId(model.id) ? current[index++]! : model
  );
}

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
    const model = selectableModels(group)[0];
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
