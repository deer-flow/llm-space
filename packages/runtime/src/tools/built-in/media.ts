import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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
import { expandHomePath } from "@llm-space/core/server";

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
      output_directory: {
        type: "string",
        description:
          "Optional absolute directory for the generated image file; a leading ~/ is expanded to the current user's home directory. Invalid or unwritable directories fall back to the system temporary directory.",
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
        const outputDirectory = args.output_directory;
        const config = _generateImageConfig(configValue);
        const result = await dependencies.generateImage({
          prompt,
          model: config.model,
          size: (size as SeedreamImageSize | undefined) ?? config.size,
          watermark: config.watermark,
          connection: context.connection,
        });
        const savedImage = await _saveGeneratedImage(
          result.data,
          result.mimeType,
          outputDirectory
        );
        const fallbackMessage = savedImage.usedTemporaryFallback
          ? " The requested output_directory was invalid or unwritable, so the system temporary directory was used."
          : "";
        return createToolCallResponse([
          {
            type: "text",
            text: `Generated image with ${result.model} at ${result.size}. Saved image to ${savedImage.path}.${fallbackMessage}`,
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

interface SavedGeneratedImage {
  path: string;
  usedTemporaryFallback: boolean;
}

/**
 * Persist generated bytes to the requested directory. Invalid or unwritable
 * requested directories fall back to the system temporary directory; failure
 * there is terminal because no durable copy of the costly result exists.
 */
async function _saveGeneratedImage(
  data: string,
  mimeType: string,
  outputDirectory: unknown
): Promise<SavedGeneratedImage> {
  const requestedDirectory = _requestedOutputDirectory(outputDirectory);
  const bytes = Buffer.from(data, "base64");
  const extension = _imageExtension(mimeType);
  let requestedWriteError: unknown;
  if (requestedDirectory) {
    try {
      return {
        path: await _writeGeneratedImage(requestedDirectory, bytes, extension),
        usedTemporaryFallback: false,
      };
    } catch (error) {
      requestedWriteError = error;
      // A generated image is expensive, so retain it via the fallback below.
    }
  }

  try {
    return {
      path: await _writeGeneratedImage(os.tmpdir(), bytes, extension),
      usedTemporaryFallback: outputDirectory !== undefined,
    };
  } catch (error) {
    const destinations =
      outputDirectory === undefined
        ? "the system temporary directory"
        : "the requested output_directory and the system temporary directory";
    throw new AggregateError(
      requestedWriteError ? [requestedWriteError, error] : [error],
      `Failed to save the generated image to ${destinations}.`,
      {
        cause: error,
      }
    );
  }
}

/** Resolve a non-empty absolute requested directory, including a leading `~/`. */
function _requestedOutputDirectory(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  const expanded = expandHomePath(value.trim());
  return path.isAbsolute(expanded) ? expanded : undefined;
}

/** Create one destination directory and write uniquely named generated bytes. */
async function _writeGeneratedImage(
  directory: string,
  bytes: Uint8Array,
  extension: string
): Promise<string> {
  const filePath = path.join(
    directory,
    `generated-image-${randomUUID()}${extension}`
  );
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(filePath, bytes);
  return filePath;
}

/**
 * Map generated MIME types to file extensions, falling back to `.img`.
 * This is intentionally separate from fs.ts's read-side extension lookup.
 */
function _imageExtension(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    default:
      return ".img";
  }
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
