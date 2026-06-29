import type { ModelProviderGroup } from "@llm-space/core";

import { availableModels } from "@/server/models";

export function GET() {
  const providers = availableModels.getProviders();
  const groups: ModelProviderGroup[] = providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    models: provider.getModels(),
  }));
  return Response.json(groups);
}
