export const SEEDREAM_IMAGE_SIZES = ["1K", "2K", "3K", "4K"] as const;

export type SeedreamImageSize = (typeof SEEDREAM_IMAGE_SIZES)[number];

export interface SeedreamImageModelDefinition {
  id: string;
  name: string;
  supportedSizes: readonly SeedreamImageSize[];
  defaultSize: SeedreamImageSize;
  /** Optional `@lobehub/icons` keyword for a user-added image model. */
  icon?: string;
}

/** Curated Ark Seedream catalog used by settings and runtime validation. */
export const SEEDREAM_IMAGE_MODELS = [
  {
    id: "doubao-seedream-5-0-pro-260628",
    name: "Seedream 5.0 Pro",
    supportedSizes: ["1K", "2K"],
    defaultSize: "2K",
  },
  {
    id: "doubao-seedream-5-0-260128",
    name: "Seedream 5.0 Lite",
    supportedSizes: ["2K", "3K", "4K"],
    defaultSize: "2K",
  },
  {
    id: "doubao-seedream-4-5-251128",
    name: "Seedream 4.5",
    supportedSizes: ["2K", "4K"],
    defaultSize: "2K",
  },
  {
    id: "doubao-seedream-4-0-250828",
    name: "Seedream 4.0",
    supportedSizes: ["1K", "2K", "4K"],
    defaultSize: "2K",
  },
] as const satisfies readonly SeedreamImageModelDefinition[];

export type SeedreamImageModelId = (typeof SEEDREAM_IMAGE_MODELS)[number]["id"];

export interface ArkImageGenerationConfig {
  /** User-added Ark image models layered on top of the curated catalog. */
  models?: SeedreamImageModelDefinition[];
  /** Image-model ids disabled in Settings. Absent means every model is enabled. */
  disabledModels?: string[];
}

/** Per-Thread configuration owned by one `generate_image` tool instance. */
export interface GenerateImageToolConfig {
  model: string;
  size: SeedreamImageSize;
  watermark: boolean;
}

export const DEFAULT_ARK_IMAGE_GENERATION_CONFIG: ArkImageGenerationConfig = {};

/** Find one curated Seedream model definition by its stable Ark model id. */
export function getSeedreamImageModelDefinition(
  modelId: string
): SeedreamImageModelDefinition | undefined {
  return SEEDREAM_IMAGE_MODELS.find((model) => model.id === modelId);
}

/** Merge the curated Seedream catalog with user-added Ark image models. */
export function getArkImageModelDefinitions(
  config: ArkImageGenerationConfig
): readonly SeedreamImageModelDefinition[] {
  return [...SEEDREAM_IMAGE_MODELS, ...(config.models ?? [])];
}

/** Resolve a curated or user-added Ark image model by id. */
export function getArkImageModelDefinition(
  config: ArkImageGenerationConfig,
  modelId: string
): SeedreamImageModelDefinition | undefined {
  return getArkImageModelDefinitions(config).find(
    (model) => model.id === modelId
  );
}

/** Whether a size preset is supported by the selected Seedream model. */
export function isSeedreamImageSizeSupported(
  modelId: string,
  size: string
): boolean {
  return Boolean(
    getSeedreamImageModelDefinition(modelId)?.supportedSizes.some(
      (supported) => supported === size
    )
  );
}

/** Whether a curated or user-added Ark model supports a size preset. */
export function isArkImageSizeSupported(
  config: ArkImageGenerationConfig,
  modelId: string,
  size: string
): boolean {
  return Boolean(
    getArkImageModelDefinition(config, modelId)?.supportedSizes.some(
      (supported) => supported === size
    )
  );
}

export const MINIMAX_IMAGE_ASPECT_RATIOS = [
  "1:1",
  "16:9",
  "4:3",
  "3:2",
  "2:3",
  "3:4",
  "9:16",
  "21:9",
] as const;

export type MiniMaxImageAspectRatio =
  (typeof MINIMAX_IMAGE_ASPECT_RATIOS)[number];

export interface MiniMaxImageModelDefinition {
  id: string;
  name: string;
  supportedAspectRatios: readonly MiniMaxImageAspectRatio[];
  defaultAspectRatio: MiniMaxImageAspectRatio;
}

/** Curated MiniMax catalog available to settings and the built-in tool. */
export const MINIMAX_IMAGE_MODELS = [
  {
    id: "image-01",
    name: "Image 01",
    supportedAspectRatios: MINIMAX_IMAGE_ASPECT_RATIOS,
    defaultAspectRatio: "1:1",
  },
  {
    id: "image-01-live",
    name: "Image 01 Live",
    supportedAspectRatios: MINIMAX_IMAGE_ASPECT_RATIOS,
    defaultAspectRatio: "1:1",
  },
] as const satisfies readonly MiniMaxImageModelDefinition[];

export interface MiniMaxImageGenerationConfig {
  /** Image-model ids disabled in Settings. Absent means every model is enabled. */
  disabledModels?: string[];
}

export type ImageGenerationConfig =
  | ArkImageGenerationConfig
  | MiniMaxImageGenerationConfig;

/** Resolve a curated MiniMax image model by id. */
export function getMiniMaxImageModelDefinition(
  modelId: string
): MiniMaxImageModelDefinition | undefined {
  return MINIMAX_IMAGE_MODELS.find((model) => model.id === modelId);
}

/** Return the curated MiniMax image catalog. */
export function getMiniMaxImageModelDefinitions(
  config: MiniMaxImageGenerationConfig
): readonly MiniMaxImageModelDefinition[] {
  void config;
  return MINIMAX_IMAGE_MODELS;
}

/** Whether a MiniMax model supports the selected aspect ratio. */
export function isMiniMaxImageAspectRatioSupported(
  modelId: string,
  aspectRatio: string
): boolean {
  return Boolean(
    getMiniMaxImageModelDefinition(modelId)?.supportedAspectRatios.some(
      (supported) => supported === aspectRatio
    )
  );
}
