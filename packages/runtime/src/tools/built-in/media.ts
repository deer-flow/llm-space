import {
  SEEDREAM_IMAGE_SIZES,
  type BuiltinTool,
  type GenerateImageToolConfig,
  type ProviderConnectionRef,
  type SeedreamImageSize,
} from "@llm-space/core";

import { createToolCallResponse, type ToolEntry } from "../tool-registry";

export interface MediaBuiltInToolsDependencies {
  generateImage(input: {
    prompt: string;
    model: string;
    size: SeedreamImageSize;
    watermark: boolean;
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
  ];
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
