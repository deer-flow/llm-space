import {
  createImagesModels,
  createImagesProvider,
  envApiKeyAuth,
  type AssistantImages,
  type ImagesModel,
  type ImagesOptions,
} from "@earendil-works/pi-ai";
import {
  getImageModelDefinition,
  getImageModelDefinitions,
  isImageSize,
  isImageSizeSupported,
  OPENAI_IMAGE_SIZES,
  SEEDREAM_IMAGE_MODELS,
  type ImageGenerationApi,
  type ImageGenerationConfig,
  type ImageModelDefinition,
  type ImageSize,
  type OpenAIImageSize,
  type ProviderConnectionRef,
} from "@llm-space/core";

import type { ModelManager, ResolvedProviderConnection } from "./model-manager";
import { ARK_BASE_URL } from "./providers/ark";

const ARK_IMAGES_API = "ark-images";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export interface ArkImageGenerationDependencies {
  getConfig(providerId: string): ImageGenerationConfig | undefined;
  resolveConnection(
    connection: ProviderConnectionRef
  ): Promise<ResolvedProviderConnection>;
  fetch?: FetchLike;
}

export interface ArkImageGenerationInput {
  prompt: string;
  model: string;
  size: ImageSize;
  watermark: boolean;
  connection?: ProviderConnectionRef;
  signal?: AbortSignal;
}

export interface ArkImageGenerationResult {
  data: string;
  mimeType: string;
  model: string;
  size: string;
}

interface ArkAssistantImages extends AssistantImages {
  generatedModel?: string;
  generatedSize?: string;
}

interface ImageGenerationMetadata {
  size: ImageSize;
  watermark: boolean;
}

interface ArkImageResponseItem {
  b64_json?: unknown;
  size?: unknown;
  error?: unknown;
}

interface ArkImageResponse {
  model?: unknown;
  data?: unknown;
  error?: unknown;
}

/**
 * Create the process-side Seedream generator. Provider configuration stays in
 * ModelManager; this adapter owns only Ark request/response semantics.
 */
export function createArkImageGenerator(
  dependencies: ArkImageGenerationDependencies
): (input: ArkImageGenerationInput) => Promise<ArkImageGenerationResult> {
  const fetchImpl = dependencies.fetch ?? globalThis.fetch;

  return async function generateArkImage(
    input: ArkImageGenerationInput
  ): Promise<ArkImageGenerationResult> {
    const prompt = input.prompt.trim();
    if (!prompt) {
      throw new Error("prompt must be a non-empty string.");
    }
    const connectionRef = input.connection ?? { providerId: "ark" };
    const providerId = connectionRef.providerId;
    const config = dependencies.getConfig(providerId);
    if (!config) {
      throw new Error(
        providerId === "ark"
          ? "Configure Image generation in Settings → Models → VolcEngine Ark before calling generate_image."
          : `Configure image generation for provider "${providerId}" before calling generate_image.`
      );
    }
    const catalog = providerId === "ark" ? SEEDREAM_IMAGE_MODELS : [];
    const modelDefinition = getImageModelDefinition(
      config,
      input.model,
      catalog
    );
    if (!modelDefinition) {
      throw new Error(
        `The configured image model "${input.model}" is no longer available on provider "${providerId}". Choose an enabled model for generate_image.`
      );
    }
    if (config.disabledModels?.includes(input.model)) {
      throw new Error(
        `The configured ${providerId === "ark" ? "Ark " : ""}image model "${modelDefinition.name}" is disabled. Choose an enabled model for generate_image.`
      );
    }
    if (!isImageSizeSupported(config, input.model, input.size, catalog)) {
      throw new Error(
        `${modelDefinition.name} does not support the ${input.size} size preset.`
      );
    }
    const connection = await dependencies.resolveConnection(connectionRef);
    const apiKey = connection.apiKey;
    if (!apiKey) {
      throw new Error(
        `Configure an API key for provider "${providerId}" before calling generate_image.`
      );
    }

    const imagesModels = createImagesModels();
    imagesModels.setProvider(
      _createImagesProvider({
        providerId,
        baseUrl:
          connection.baseUrl ?? (providerId === "ark" ? ARK_BASE_URL : ""),
        config,
        catalog,
        fetch: fetchImpl,
      })
    );
    const model = imagesModels.getModel(providerId, input.model);
    if (!model) {
      throw new Error(`Unsupported image model: ${input.model}`);
    }
    const generated = (await imagesModels.generateImages(
      model,
      { input: [{ type: "text", text: prompt }] },
      {
        apiKey,
        headers: connection.headers,
        metadata: { size: input.size, watermark: input.watermark },
        signal: input.signal,
      }
    )) as ArkAssistantImages;
    if (generated.stopReason !== "stop") {
      throw new Error(generated.errorMessage ?? "Ark image generation failed.");
    }
    const image = generated.output.find((item) => item.type === "image");
    if (image?.type !== "image") {
      throw new Error("Ark image generation returned no image data.");
    }
    return {
      data: image.data,
      mimeType: image.mimeType,
      model: generated.generatedModel ?? input.model,
      size: generated.generatedSize ?? input.size,
    };
  };
}

/** Bind provider-owned image generation to the shared model connection resolver. */
export function createConfiguredArkImageGenerator({
  modelManager,
  env,
}: {
  modelManager: ModelManager;
  env: Record<string, string | undefined>;
}) {
  return createArkImageGenerator({
    getConfig: (providerId) =>
      modelManager.getImageGenerationConfig(providerId),
    resolveConnection: (connection) =>
      modelManager.resolveConnection(connection, {
        fallbackApiKey:
          connection.providerId === "ark" ? env.ARK_API_KEY : undefined,
      }),
  });
}

/** Build a pi-ai image provider around the configured request protocol. */
function _createImagesProvider({
  providerId,
  baseUrl,
  config,
  catalog,
  fetch,
}: {
  providerId: string;
  baseUrl: string;
  config: ImageGenerationConfig;
  catalog: readonly ImageModelDefinition[];
  fetch: FetchLike;
}) {
  if (!baseUrl) {
    throw new Error(`Configure a Base URL for provider "${providerId}".`);
  }
  const api =
    config.api ?? (providerId === "ark" ? "ark-images" : "openai-images");
  const models: ImagesModel<typeof ARK_IMAGES_API>[] = getImageModelDefinitions(
    config,
    catalog
  ).map((definition) => ({
    id: definition.id,
    name: definition.name,
    api: ARK_IMAGES_API,
    provider: providerId,
    baseUrl,
    input: ["text"],
    output: ["image"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
  }));
  return createImagesProvider({
    id: providerId,
    name: providerId,
    auth: { apiKey: envApiKeyAuth("ARK_API_KEY", ["ARK_API_KEY"]) },
    models,
    api: {
      generateImages: (model, context, options) =>
        _generateImages(model, context.input, options, fetch, api),
    },
  });
}

/** Execute one synchronous image request and normalize it to pi image content. */
async function _generateImages(
  model: ImagesModel<string>,
  input: { type: string; text?: string }[],
  options: ImagesOptions | undefined,
  fetch: FetchLike,
  api: ImageGenerationApi
): Promise<ArkAssistantImages> {
  const label =
    api === "ark-images" ? "Ark image generation" : "Image generation";
  const output: ArkAssistantImages = {
    api: model.api,
    provider: model.provider,
    model: model.id,
    output: [],
    stopReason: "stop",
    timestamp: Date.now(),
  };
  try {
    if (!options?.apiKey) {
      throw new Error(`No API key for provider: ${model.provider}`);
    }
    const prompt = input
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n");
    const metadata = _imageMetadata(options.metadata);
    let payload: unknown = {
      model: model.id,
      prompt,
      ...(api === "ark-images"
        ? {
            size: metadata.size,
            response_format: "b64_json",
            watermark: metadata.watermark,
            stream: false,
          }
        : api === "openai-images-extra-body"
          ? {
              size: metadata.size,
              return_base64: true,
              extra_body: { response_format: "b64_json" },
            }
          : _openAIImagesPayload(model.id, metadata.size)),
    };
    const transformed = await options.onPayload?.(payload, model);
    if (transformed !== undefined) {
      payload = transformed;
    }
    const response = await fetch(_arkImagesUrl(model.baseUrl), {
      method: "POST",
      headers: {
        ..._requestHeaders(options.headers),
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: options.signal,
    });
    await options.onResponse?.(
      {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
      },
      model
    );
    const body = await _readImageResponse(response, label);
    if (!response.ok) {
      throw _providerError(
        body.error ?? body,
        `HTTP ${response.status}`,
        label
      );
    }
    if (body.error) {
      throw _providerError(body.error, "Provider error", label);
    }
    const items = Array.isArray(body.data)
      ? (body.data as ArkImageResponseItem[])
      : [];
    const succeeded = items.find(
      (item) => typeof item.b64_json === "string" && item.b64_json.length > 0
    );
    if (!succeeded) {
      const failed = items.find((item) => item.error)?.error;
      if (failed) {
        throw _providerError(failed, "Image generation failed", label);
      }
      throw new Error(`${label} returned no image data.`);
    }
    const image = _normalizeBase64Image(succeeded.b64_json as string, label);
    output.output.push({ type: "image", ...image });
    output.generatedModel =
      typeof body.model === "string" ? body.model : model.id;
    output.generatedSize =
      typeof succeeded.size === "string" ? succeeded.size : metadata.size;
    return output;
  } catch (error) {
    output.stopReason = options?.signal?.aborted ? "aborted" : "error";
    output.errorMessage = options?.signal?.aborted
      ? `${label} was aborted.`
      : error instanceof Error
        ? error.message
        : `${label} failed.`;
    return output;
  }
}

/** Build only parameters accepted by the selected standard OpenAI image model. */
function _openAIImagesPayload(
  modelId: string,
  configuredSize: ImageSize
): { size: OpenAIImageSize; response_format?: "b64_json" } {
  const size = _openAIImageSize(modelId, configuredSize);
  return {
    size,
    ...(_isDallEModel(modelId) ? { response_format: "b64_json" as const } : {}),
  };
}

/** Validate standard protocol sizes, with a narrow migration for legacy 1K configs. */
function _openAIImageSize(
  modelId: string,
  configuredSize: ImageSize
): OpenAIImageSize {
  const size = configuredSize === "1K" ? "1024x1024" : configuredSize;
  if (!(OPENAI_IMAGE_SIZES as readonly string[]).includes(size)) {
    throw new Error(
      `OpenAI Images requires an explicit pixel size; configure ${modelId} with an OpenAI-compatible size instead of ${configuredSize}.`
    );
  }
  if (modelId === "dall-e-2") {
    const supported = ["256x256", "512x512", "1024x1024"];
    if (!supported.includes(size)) {
      throw new Error(`dall-e-2 does not support image size ${size}.`);
    }
  } else if (modelId === "dall-e-3") {
    const supported = ["1024x1024", "1792x1024", "1024x1792"];
    if (!supported.includes(size)) {
      throw new Error(`dall-e-3 does not support image size ${size}.`);
    }
  } else if (modelId.startsWith("gpt-image-")) {
    const supported = ["auto", "1024x1024", "1536x1024", "1024x1536"];
    if (!supported.includes(size)) {
      throw new Error(`${modelId} does not support image size ${size}.`);
    }
  }
  return size as OpenAIImageSize;
}

function _isDallEModel(modelId: string): boolean {
  return modelId === "dall-e-2" || modelId === "dall-e-3";
}

/** Read JSON without exposing a provider's raw body in malformed-response errors. */
async function _readImageResponse(
  response: Response,
  label: string
): Promise<ArkImageResponse> {
  const text = await response.text();
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object") {
      throw new Error();
    }
    return value;
  } catch {
    throw new Error(
      `${label} returned invalid JSON (HTTP ${response.status}).`
    );
  }
}

/** Keep Ark's machine-readable code while avoiding raw response serialization. */
function _providerError(
  value: unknown,
  fallback: string,
  label: string
): Error {
  const candidate =
    value && typeof value === "object"
      ? (value as { code?: unknown; message?: unknown })
      : {};
  const code =
    typeof candidate.code === "string" && candidate.code.trim()
      ? candidate.code.trim()
      : fallback;
  const message =
    typeof candidate.message === "string" && candidate.message.trim()
      ? candidate.message.trim()
      : "Request failed.";
  return new Error(`${label} failed (${code}): ${message}`);
}

/** Resolve and validate the provider-specific options carried in pi metadata. */
function _imageMetadata(
  metadata: Record<string, unknown> | undefined
): ImageGenerationMetadata {
  const size = metadata?.size;
  if (!isImageSize(size)) {
    throw new Error("Image generation size metadata is invalid.");
  }
  if (typeof metadata?.watermark !== "boolean") {
    throw new Error("Image generation watermark metadata is invalid.");
  }
  return { size, watermark: metadata.watermark };
}

/** Append the native image route to an official or user-supplied Ark API root. */
function _arkImagesUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/images/generations`;
}

/** Drop null-suppressed pi headers before passing them to fetch. */
function _requestHeaders(
  headers: Record<string, string | null> | undefined
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers ?? {}).filter(
      (entry): entry is [string, string] => entry[1] !== null
    )
  );
}

/** Normalize either a raw base64 value or a data URL and infer its MIME type. */
function _normalizeBase64Image(
  value: string,
  label: string
): {
  data: string;
  mimeType: string;
} {
  const dataUrl = /^data:([^;,]+);base64,(.+)$/s.exec(value);
  const mimeType = dataUrl?.[1];
  const data = (dataUrl?.[2] ?? value).replace(/\s/g, "");
  if (!data || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    throw new Error(`${label} returned malformed base64 data.`);
  }
  const bytes = Buffer.from(data, "base64");
  if (bytes.length === 0) {
    throw new Error(`${label} returned empty image data.`);
  }
  return {
    data,
    mimeType: mimeType ?? _detectImageMimeType(bytes),
  };
}

/** Infer common image formats; Ark defaults to JPEG when no format is stated. */
function _detectImageMimeType(bytes: Uint8Array): string {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return "image/jpeg";
}
