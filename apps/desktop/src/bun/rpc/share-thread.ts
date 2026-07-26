import type {
  ModelConfig,
  ModelProviderGroup,
  Thread,
} from "@llm-space/core";
import { resolveModelConfig } from "@llm-space/core/thread";

/**
 * Build the copy published by sharing without mutating the local thread.
 *
 * A local thread may intentionally omit `model` and rely on the user's default
 * or first available model. The web viewer has no provider registry, so freeze
 * that resolved model and its display name into the shared copy.
 */
export function buildSharedThread(
  thread: Thread,
  providers: ModelProviderGroup[],
  defaultModel: ModelConfig | null,
  title?: string
): Thread {
  const model = resolveModelConfig(providers, thread.model, defaultModel);
  const modelName = model
    ? providers
        .find((provider) => provider.id === model.provider)
        ?.models.find((candidate) => candidate.id === model.id)?.name ?? model.id
    : undefined;

  return {
    ...thread,
    ...(title !== undefined ? { title } : {}),
    ...(model ? { model, modelName } : {}),
  };
}
