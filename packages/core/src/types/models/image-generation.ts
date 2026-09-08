export const SEEDREAM_IMAGE_SIZES = ["1K", "2K", "3K", "4K"] as const;

export type SeedreamImageSize = (typeof SEEDREAM_IMAGE_SIZES)[number];

export const OPENAI_IMAGE_SIZES = [
  "auto",
  "256x256",
  "512x512",
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "1792x1024",
  "1024x1792",
] as const;

export type OpenAIImageSize = (typeof OPENAI_IMAGE_SIZES)[number];

export const IMAGE_SIZES = [
  ...SEEDREAM_IMAGE_SIZES,
  ...OPENAI_IMAGE_SIZES,
] as const;

export type ImageSize = (typeof IMAGE_SIZES)[number];

export interface ImageModelDefinition {
  id: string;
  name: string;
  supportedSizes: readonly ImageSize[];
  defaultSize: ImageSize;
  /** Optional `@lobehub/icons` keyword for a user-added image model. */
  icon?: string;
}

/** @deprecated Use ImageModelDefinition. */
export type SeedreamImageModelDefinition = ImageModelDefinition;

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
] as const satisfies readonly ImageModelDefinition[];

export type SeedreamImageModelId = (typeof SEEDREAM_IMAGE_MODELS)[number]["id"];

export type ImageGenerationApi =
  "ark-images" | "openai-images" | "openai-images-extra-body";

export interface ImageGenerationConfig {
  /** Request protocol. Ark defaults to its native API; custom providers use OpenAI Images. */
  api?: ImageGenerationApi;
  /** User-added image models layered on top of an optional provider catalog. */
  models?: ImageModelDefinition[];
  /** Image-model ids disabled in Settings. Absent means every model is enabled. */
  disabledModels?: string[];
}

/** @deprecated Use ImageGenerationConfig. */
export type ArkImageGenerationConfig = ImageGenerationConfig;

/** Per-Thread configuration owned by one `generate_image` tool instance. */
export interface GenerateImageToolConfig {
  model: string;
  size: ImageSize;
  watermark: boolean;
}

export const DEFAULT_ARK_IMAGE_GENERATION_CONFIG: ImageGenerationConfig = {};

/** Find one curated Seedream model definition by its stable Ark model id. */
export function getSeedreamImageModelDefinition(
  modelId: string
): SeedreamImageModelDefinition | undefined {
  return SEEDREAM_IMAGE_MODELS.find((model) => model.id === modelId);
}

/** Merge the curated Seedream catalog with user-added Ark image models. */
export function getArkImageModelDefinitions(
  config: ImageGenerationConfig
): readonly ImageModelDefinition[] {
  return getImageModelDefinitions(config, SEEDREAM_IMAGE_MODELS);
}

/** Merge a provider's optional built-in catalog with its user-owned models. */
export function getImageModelDefinitions(
  config: ImageGenerationConfig,
  catalog: readonly ImageModelDefinition[] = []
): readonly ImageModelDefinition[] {
  return [...catalog, ...(config.models ?? [])];
}

/** Resolve a curated or user-added Ark image model by id. */
export function getArkImageModelDefinition(
  config: ImageGenerationConfig,
  modelId: string
): SeedreamImageModelDefinition | undefined {
  return getArkImageModelDefinitions(config).find(
    (model) => model.id === modelId
  );
}

/** Resolve one configured image model using the owning provider's catalog. */
export function getImageModelDefinition(
  config: ImageGenerationConfig,
  modelId: string,
  catalog: readonly ImageModelDefinition[] = []
): ImageModelDefinition | undefined {
  return getImageModelDefinitions(config, catalog).find(
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
  config: ImageGenerationConfig,
  modelId: string,
  size: string
): boolean {
  return isImageSizeSupported(config, modelId, size, SEEDREAM_IMAGE_MODELS);
}

/** Whether a configured provider image model supports a size preset. */
export function isImageSizeSupported(
  config: ImageGenerationConfig,
  modelId: string,
  size: string,
  catalog: readonly ImageModelDefinition[] = []
): boolean {
  return Boolean(
    getImageModelDefinition(config, modelId, catalog)?.supportedSizes.some(
      (supported) => supported === size
    )
  );
}

/** Narrow untrusted values to a supported provider image-size option. */
export function isImageSize(value: unknown): value is ImageSize {
  return (
    typeof value === "string" &&
    (IMAGE_SIZES as readonly string[]).includes(value)
  );
}
