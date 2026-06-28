import type { ModelConfig } from "@llm-space/core";
import type * as pi from "@earendil-works/pi-ai";

export type ModelProviderGroup = {
  id: string;
  name: string;
  models: readonly pi.Model<pi.Api>[];
};

export function defaultModelFromGroups(
  groups: readonly ModelProviderGroup[]
): Pick<ModelConfig, "id" | "provider"> {
  const firstModel = groups[0]?.models[0];
  if (!firstModel) {
    throw new Error("No models configured");
  }
  return { provider: firstModel.provider, id: firstModel.id };
}
