import {
  createConfiguredArkImageGenerator,
  type ArkImageGenerationInput,
  type ArkImageGenerationResult,
} from "./ark-image-generation";
import {
  createConfiguredMiniMaxImageGenerator,
  type MiniMaxImageGenerationInput,
} from "./minimax-image-generation";
import type { ModelManager } from "./model-manager";

export type ImageGenerationInput =
  | ArkImageGenerationInput
  | MiniMaxImageGenerationInput;

/** Route a built-in image tool call through its selected provider connection. */
export function createConfiguredImageGenerator({
  modelManager,
  env,
}: {
  modelManager: ModelManager;
  env: Record<string, string | undefined>;
}): (input: ImageGenerationInput) => Promise<ArkImageGenerationResult> {
  const generateArkImage = createConfiguredArkImageGenerator({
    modelManager,
    env,
  });
  const generateMiniMaxImage = createConfiguredMiniMaxImageGenerator({
    modelManager,
    env,
  });

  return (input) => {
    const connection = input.connection;
    return connection?.providerId === "minimax"
      ? generateMiniMaxImage(input)
      : generateArkImage(input as ArkImageGenerationInput);
  };
}
