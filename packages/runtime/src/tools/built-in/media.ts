import {
  MINIMAX_IMAGE_ASPECT_RATIOS,
  MINIMAX_IMAGE_MODELS,
  SEEDREAM_IMAGE_SIZES,
  type BuiltinTool,
  type GenerateImageToolConfig,
  type MiniMaxImageAspectRatio,
  type ProviderConnectionRef,
  type SeedreamImageSize,
} from "@llm-space/core";

import { createToolCallResponse, type ToolEntry } from "../tool-registry";

export interface MediaBuiltInToolsDependencies {
  generateImage(input: {
    prompt: string;
    model?: string;
    size?: SeedreamImageSize;
    watermark?: boolean;
    aspectRatio?: MiniMaxImageAspectRatio;
    width?: number;
    height?: number;
    seed?: number;
    promptOptimizer?: boolean;
    connection?: ProviderConnectionRef;
  }): Promise<{
    data: string;
    mimeType: string;
    model: string;
    size: string;
  }>;
}

export const generateImageTool: BuiltinTool = {
  type: "builtin",
  name: "generate_image",
  icon: "image",
  connection: { providerId: "ark" },
  description:
    "Generate one image with this tool's selected Ark image model. Use the configured default size unless the user requests a supported 1K, 2K, 3K, or 4K preset.",
  strict: true,
  parameters: {
    type: "object",
    required: ["prompt"],
    properties: {
      prompt: {
        type: "string",
        minLength: 1,
        description: "A detailed description of the image to generate.",
      },
      size: {
        type: "string",
        enum: [...SEEDREAM_IMAGE_SIZES],
        description:
          "Optional resolution preset. Omit it to use the configured default; unsupported presets for the configured model return an error.",
      },
    },
    additionalProperties: false,
  },
};

export const generateMiniMaxImageTool: BuiltinTool = {
  type: "builtin",
  name: "generate_minimax_image",
  icon: "image",
  connection: { providerId: "minimax" },
  description:
    "Generate one image with MiniMax. Use an aspect ratio or an explicit width and height when the user requests a particular composition.",
  strict: true,
  parameters: {
    type: "object",
    required: ["prompt"],
    properties: {
      prompt: {
        type: "string",
        minLength: 1,
        maxLength: 1500,
        description: "A detailed description of the image to generate.",
      },
      model: {
        type: "string",
        enum: MINIMAX_IMAGE_MODELS.map((model) => model.id),
        description: "Optional image model. Omit it to use the first enabled model.",
      },
      aspect_ratio: {
        type: "string",
        enum: [...MINIMAX_IMAGE_ASPECT_RATIOS],
        description:
          "Optional image aspect ratio. Omit it when providing width and height.",
      },
      width: {
        type: "integer",
        minimum: 512,
        maximum: 2048,
        multipleOf: 8,
        description: "Optional width in pixels; height is required with it.",
      },
      height: {
        type: "integer",
        minimum: 512,
        maximum: 2048,
        multipleOf: 8,
        description: "Optional height in pixels; width is required with it.",
      },
      seed: {
        type: "integer",
        minimum: 0,
        description: "Optional non-negative seed for reproducible generation.",
      },
      prompt_optimizer: {
        type: "boolean",
        description: "Whether to optimize the prompt before generation.",
      },
    },
    additionalProperties: false,
  },
};

/** Create the Media contribution around the injected image-generation service. */
export function createMediaBuiltInTools(
  dependencies: MediaBuiltInToolsDependencies
): ToolEntry[] {
  return [
    {
      tool: generateImageTool,
      async execute(
        args: Record<string, unknown>,
        configValue?: Record<string, unknown>,
        context = {}
      ) {
        const prompt = args.prompt;
        if (typeof prompt !== "string" || !prompt.trim()) {
          throw new Error("prompt must be a non-empty string.");
        }
        const size = args.size;
        if (
          size !== undefined &&
          !SEEDREAM_IMAGE_SIZES.some((candidate) => candidate === size)
        ) {
          throw new Error("size must be one of 1K, 2K, 3K, or 4K.");
        }
        const config = _generateImageConfig(configValue);
        const result = await dependencies.generateImage({
          prompt,
          model: config.model,
          size: (size as SeedreamImageSize | undefined) ?? config.size,
          watermark: config.watermark,
          connection: context.connection,
        });
        return createToolCallResponse([
          {
            type: "text",
            text: `Generated image with ${result.model} at ${result.size}.`,
          },
          {
            type: "image",
            data: result.data,
            mimeType: result.mimeType,
          },
        ]);
      },
    },
    {
      tool: generateMiniMaxImageTool,
      async execute(args: Record<string, unknown>, _config, context = {}) {
        const prompt = args.prompt;
        if (typeof prompt !== "string" || !prompt.trim()) {
          throw new Error("prompt must be a non-empty string.");
        }
        const model = args.model;
        if (
          model !== undefined &&
          !MINIMAX_IMAGE_MODELS.some((candidate) => candidate.id === model)
        ) {
          throw new Error("model must be an available MiniMax image model.");
        }
        const aspectRatio = args.aspect_ratio;
        if (
          aspectRatio !== undefined &&
          !MINIMAX_IMAGE_ASPECT_RATIOS.some(
            (candidate) => candidate === aspectRatio
          )
        ) {
          throw new Error("aspect_ratio is not supported.");
        }
        const width = _optionalNumber(args.width, "width");
        const height = _optionalNumber(args.height, "height");
        const seed = _optionalNumber(args.seed, "seed");
        const promptOptimizer = args.prompt_optimizer;
        if (
          promptOptimizer !== undefined &&
          typeof promptOptimizer !== "boolean"
        ) {
          throw new Error("prompt_optimizer must be a boolean.");
        }
        const result = await dependencies.generateImage({
          prompt,
          ...(typeof model === "string" ? { model } : {}),
          ...(aspectRatio
            ? { aspectRatio: aspectRatio as MiniMaxImageAspectRatio }
            : {}),
          ...(width !== undefined ? { width } : {}),
          ...(height !== undefined ? { height } : {}),
          ...(seed !== undefined ? { seed } : {}),
          ...(typeof promptOptimizer === "boolean"
            ? { promptOptimizer }
            : {}),
          connection: context.connection,
        });
        return createToolCallResponse([
          {
            type: "text",
            text: `Generated MiniMax image with ${result.model} at ${result.size}.`,
          },
          {
            type: "image",
            data: result.data,
            mimeType: result.mimeType,
          },
        ]);
      },
    },
  ];
}

function _optionalNumber(value: unknown, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number") {
    throw new Error(`${name} must be a number.`);
  }
  return value;
}

/** Validate the user-owned configuration persisted on the Thread tool. */
function _generateImageConfig(
  value: Record<string, unknown> | undefined
): GenerateImageToolConfig {
  const model = value?.model;
  const size = value?.size;
  const watermark = value?.watermark;
  if (typeof model !== "string" || !model.trim()) {
    throw new Error(
      "Choose an enabled image model for generate_image in Add built-in tools."
    );
  }
  if (!SEEDREAM_IMAGE_SIZES.some((candidate) => candidate === size)) {
    throw new Error(
      "Choose a valid default size for generate_image in Add built-in tools."
    );
  }
  if (typeof watermark !== "boolean") {
    throw new Error(
      "Choose a watermark policy for generate_image in Add built-in tools."
    );
  }
  return { model, size: size as SeedreamImageSize, watermark };
}
