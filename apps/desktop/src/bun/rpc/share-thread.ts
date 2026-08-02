import type {
  ModelConfig,
  ModelProviderGroup,
  Thread,
} from "@llm-space/core";
import {
  GIST_CONNECTOR_ID,
  type GistThreadWriter,
} from "@llm-space/core/storage";
import { resolveModelConfig } from "@llm-space/core/thread";
import type { RuntimeClient, RuntimeId } from "@llm-space/runtime/runtime";

import { buildWebShareUrl } from "../../shared/share";

interface ShareThreadInput {
  runtimeId: RuntimeId;
  path: string;
  title?: string;
  description?: string;
}

interface ShareThreadHandlerDependencies {
  getRuntime: (runtimeId: RuntimeId) => RuntimeClient;
  gistWriter: Pick<GistThreadWriter, "write">;
}

/**
 * Create the Bun RPC handler that publishes a thread from exactly one runtime.
 * Runtime resolution happens once, before any filesystem or model reads.
 */
export function createShareThreadHandler({
  getRuntime,
  gistWriter,
}: ShareThreadHandlerDependencies) {
  return async ({ runtimeId, path, title, description }: ShareThreadInput) => {
    const runtime = getRuntime(runtimeId);
    if (runtime.info().status !== "connected") {
      throw new Error(`Runtime is not connected: ${runtimeId}`);
    }
    const [thread, providers, defaultModel] = await Promise.all([
      runtime.fsRead(path),
      runtime.availableModels(),
      runtime.getDefaultModel(),
    ]);
    const shared = buildSharedThread(thread, providers, defaultModel, title);
    const locator = await gistWriter.write(shared, undefined, { description });
    return {
      gistId: locator.id,
      shareUrl: buildWebShareUrl(GIST_CONNECTOR_ID, locator.id),
    };
  };
}

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
