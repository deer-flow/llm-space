import {
  createImagesModels,
  createImagesProvider,
  envApiKeyAuth,
  type AssistantImages,
  type ImagesModel,
  type ImagesOptions,
} from "@earendil-works/pi-ai";
import {
  getArkImageModelDefinition,
  getArkImageModelDefinitions,
  isArkImageSizeSupported,
  type ArkImageGenerationConfig,
  type ProviderConnectionRef,
  type SeedreamImageSize,
} from "@llm-space/core";

import type { ModelManager, ResolvedProviderConnection } from "./model-manager";
import { ARK_BASE_URL } from "./providers/ark";

const ARK_IMAGES_API = "ark-images";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export interface ArkImageGenerationDependencies {
  getConfig(): ArkImageGenerationConfig | undefined;
  resolveConnection(
    connection: ProviderConnectionRef
  ): Promise<ResolvedProviderConnection>;
  fetch?: FetchLike;
}

export interface ArkImageGenerationInput {
  prompt: string;
  model: string;
  size: SeedreamImageSize;
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

interface ArkImagesMetadata {
  size: SeedreamImageSize;
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
    const config = dependencies.getConfig();
    if (!config) {
      throw new Error(
        "Configure Image generation in Settings → Models → VolcEngine Ark before calling generate_image."
      );
    }
    const modelDefinition = getArkImageModelDefinition(config, input.model);
    if (!modelDefinition) {
      throw new Error(
        `The configured Ark image model "${input.model}" is no longer available. Choose an enabled model for generate_image.`
      );
    }
    if (config.disabledModels?.includes(input.model)) {
      throw new Error(
        `The configured Ark image model "${modelDefinition.name}" is disabled. Choose an enabled model for generate_image.`
      );
    }
    if (!isArkImageSizeSupported(config, input.model, input.size)) {
      throw new Error(
        `${modelDefinition.name} does not support the ${input.size} size preset.`
      );
    }
    const connectionRef = input.connection ?? { providerId: "ark" };
    if (connectionRef.providerId !== "ark") {
      throw new Error(
        `Ark image generation cannot use provider: ${connectionRef.providerId}`
      );
    }
    const connection = await dependencies.resolveConnection(connectionRef);
    const apiKey = connection.apiKey;
    if (!apiKey) {
      throw new Error(
        "Configure an Ark API key in Settings → Models → VolcEngine Ark before calling generate_image."
      );
    }

    const imagesModels = createImagesModels();
    imagesModels.setProvider(
      _createArkImagesProvider({
        baseUrl: connection.baseUrl ?? ARK_BASE_URL,
        config,
        fetch: fetchImpl,
      })
    );
    const model = imagesModels.getModel("ark", input.model);
    if (!model) {
      throw new Error(`Unsupported Seedream model: ${input.model}`);
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

/** Bind Ark generation to the shared model connection resolver. */
export function createConfiguredArkImageGenerator({
  modelManager,
  env,
}: {
  modelManager: ModelManager;
  env: Record<string, string | undefined>;
}) {
  return createArkImageGenerator({
    getConfig: () => modelManager.getArkImageGenerationConfig(),
    resolveConnection: (connection) =>
      modelManager.resolveConnection(connection, {
        fallbackApiKey: env.ARK_API_KEY,
      }),
  });
}

/** Build the pi-ai image provider around Ark's native generation endpoint. */
function _createArkImagesProvider({
  baseUrl,
  config,
  fetch,
}: {
  baseUrl: string;
  config: ArkImageGenerationConfig;
  fetch: FetchLike;
}) {
  const models: ImagesModel<typeof ARK_IMAGES_API>[] =
    getArkImageModelDefinitions(config).map((definition) => ({
      id: definition.id,
      name: definition.name,
      api: ARK_IMAGES_API,
      provider: "ark",
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
    id: "ark",
    name: "VolcEngine Ark",
    auth: { apiKey: envApiKeyAuth("ARK_API_KEY", ["ARK_API_KEY"]) },
    models,
    api: {
      generateImages: (model, context, options) =>
        _generateArkImages(model, context.input, options, fetch),
    },
  });
}

/** Execute one synchronous Ark request and normalize it to pi image content. */
async function _generateArkImages(
  model: ImagesModel<string>,
  input: { type: string; text?: string }[],
  options: ImagesOptions | undefined,
  fetch: FetchLike
): Promise<ArkAssistantImages> {
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
      throw new Error("No API key for provider: ark");
    }
    const prompt = input
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n");
    const metadata = _arkMetadata(options.metadata);
    let payload: unknown = {
      model: model.id,
      prompt,
      size: metadata.size,
      watermark: metadata.watermark,
      response_format: "b64_json",
      stream: false,
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
    const body = await _readArkResponse(response);
    if (!response.ok) {
      throw _arkProviderError(body.error ?? body, `HTTP ${response.status}`);
    }
    if (body.error) {
      throw _arkProviderError(body.error, "Provider error");
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
        throw _arkProviderError(failed, "Image generation failed");
      }
      throw new Error("Ark image generation returned no image data.");
    }
    const image = _normalizeBase64Image(succeeded.b64_json as string);
    output.output.push({ type: "image", ...image });
    output.generatedModel =
      typeof body.model === "string" ? body.model : model.id;
    output.generatedSize =
      typeof succeeded.size === "string" ? succeeded.size : metadata.size;
    return output;
  } catch (error) {
    output.stopReason = options?.signal?.aborted ? "aborted" : "error";
    output.errorMessage = options?.signal?.aborted
      ? "Ark image generation was aborted."
      : error instanceof Error
        ? error.message
        : "Ark image generation failed.";
    return output;
  }
}

/** Read JSON without exposing a provider's raw body in malformed-response errors. */
async function _readArkResponse(response: Response): Promise<ArkImageResponse> {
  const text = await response.text();
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object") {
      throw new Error();
    }
    return value;
  } catch {
    throw new Error(
      `Ark image generation returned invalid JSON (HTTP ${response.status}).`
    );
  }
}

/** Keep Ark's machine-readable code while avoiding raw response serialization. */
function _arkProviderError(value: unknown, fallback: string): Error {
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
  return new Error(`Ark image generation failed (${code}): ${message}`);
}

/** Resolve and validate the provider-specific options carried in pi metadata. */
function _arkMetadata(
  metadata: Record<string, unknown> | undefined
): ArkImagesMetadata {
  const size = metadata?.size;
  if (size !== "1K" && size !== "2K" && size !== "3K" && size !== "4K") {
    throw new Error("Ark image generation size metadata is invalid.");
  }
  if (typeof metadata?.watermark !== "boolean") {
    throw new Error("Ark image generation watermark metadata is invalid.");
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
function _normalizeBase64Image(value: string): {
  data: string;
  mimeType: string;
} {
  const dataUrl = /^data:([^;,]+);base64,(.+)$/s.exec(value);
  const mimeType = dataUrl?.[1];
  const data = (dataUrl?.[2] ?? value).replace(/\s/g, "");
  if (!data || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    throw new Error("Ark image generation returned malformed base64 data.");
  }
  const bytes = Buffer.from(data, "base64");
  if (bytes.length === 0) {
    throw new Error("Ark image generation returned empty image data.");
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
