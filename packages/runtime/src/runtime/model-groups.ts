import type { ModelProviderGroup } from "@llm-space/core";

import type { ModelManager } from "../models";

export async function getModelProviderGroups(
  modelManager: ModelManager
): Promise<ModelProviderGroup[]> {
  const models = await modelManager.getAvailableModels();
  return models.getProviders().map((provider): ModelProviderGroup => ({
    ...modelManager.getProviderSource(provider.id),
    id: provider.id,
    name: provider.name,
    builtin: modelManager.isBuiltin(provider.id),
    models: provider.getModels(),
    profiles: modelManager.getProfiles(provider.id),
    api: modelManager.getApi(provider.id),
    disabledModels: modelManager.getDisabledModels(provider.id),
    customModels: modelManager.getCustomModels(provider.id),
    imageGeneration:
      provider.id === "ark"
        ? modelManager.getArkImageGenerationConfig()
        : undefined,
    websiteLink: modelManager.getWebsiteLink(provider.id),
    icon: modelManager.getProviderIcon(provider.id),
  }));
}
