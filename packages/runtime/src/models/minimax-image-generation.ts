import {
  getMiniMaxImageModelDefinition,
  getMiniMaxImageModelDefinitions,
  isMiniMaxImageAspectRatioSupported,
  type MiniMaxImageAspectRatio,
  type MiniMaxImageGenerationConfig,
  type ProviderConnectionRef,
} from "@llm-space/core";

import type { ModelManager, ResolvedProviderConnection } from "./model-manager";

const MINIMAX_IMAGE_BASE_URL = "https://api.minimax.io/v1";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export interface MiniMaxImageGenerationDependencies {
  getConfig(): MiniMaxImageGenerationConfig | undefined;
  resolveConnection(
    connection: ProviderConnectionRef
  ): Promise<ResolvedProviderConnection>;
  fetch?: FetchLike;
}

export interface MiniMaxImageGenerationInput {
  prompt: string;
  model?: string;
  aspectRatio?: MiniMaxImageAspectRatio;
  width?: number;
  height?: number;
  seed?: number;
  promptOptimizer?: boolean;
  connection?: ProviderConnectionRef;
  signal?: AbortSignal;
}

export interface MiniMaxImageGenerationResult {
  data: string;
  mimeType: string;
  model: string;
  size: string;
}

interface MiniMaxImageResponse {
  data?: {
    image_urls?: unknown;
    image_base64?: unknown;
  };
  base_resp?: {
    status_code?: unknown;
    status_msg?: unknown;
  };
}

/** Create the process-side MiniMax text-to-image generator. */
export function createMiniMaxImageGenerator(
  dependencies: MiniMaxImageGenerationDependencies
): (
  input: MiniMaxImageGenerationInput
) => Promise<MiniMaxImageGenerationResult> {
  const fetchImpl = dependencies.fetch ?? globalThis.fetch;

  return async function generateMiniMaxImage(
    input: MiniMaxImageGenerationInput
  ): Promise<MiniMaxImageGenerationResult> {
    const prompt = input.prompt.trim();
    if (!prompt || prompt.length > 1500) {
      throw new Error("prompt must contain between 1 and 1500 characters.");
    }
    const config = dependencies.getConfig();
    if (!config) {
      throw new Error(
        "Configure MiniMax image generation in Settings → Models before calling generate_minimax_image."
      );
    }
    const enabledModels = getMiniMaxImageModelDefinitions(config).filter(
      (model) => !config.disabledModels?.includes(model.id)
    );
    const modelId = input.model ?? enabledModels[0]?.id;
    const modelDefinition = modelId
      ? getMiniMaxImageModelDefinition(modelId)
      : undefined;
    if (!modelDefinition) {
      throw new Error(
        `The configured MiniMax image model "${modelId ?? ""}" is not available.`
      );
    }
    if (config.disabledModels?.includes(modelId)) {
      throw new Error(
        `The configured MiniMax image model "${modelDefinition.name}" is disabled.`
      );
    }

    const dimensions = _dimensions(input);
    const aspectRatio =
      input.aspectRatio ??
      (dimensions ? undefined : modelDefinition.defaultAspectRatio);
    if (
      aspectRatio &&
      !isMiniMaxImageAspectRatioSupported(modelId, aspectRatio)
    ) {
      throw new Error(
        `${modelDefinition.name} does not support the ${aspectRatio} aspect ratio.`
      );
    }
    if (
      input.seed !== undefined &&
      (!Number.isSafeInteger(input.seed) || input.seed < 0)
    ) {
      throw new Error("seed must be a non-negative integer.");
    }

    const connectionRef = input.connection ?? { providerId: "minimax" };
    if (connectionRef.providerId !== "minimax") {
      throw new Error(
        `MiniMax image generation cannot use provider: ${connectionRef.providerId}`
      );
    }
    const connection = await dependencies.resolveConnection(connectionRef);
    if (!connection.apiKey) {
      throw new Error(
        "Configure a MiniMax API key in Settings → Models before calling generate_minimax_image."
      );
    }

    const response = await fetchImpl(
      _imageGenerationUrl(connection.baseUrl ?? MINIMAX_IMAGE_BASE_URL),
      {
        method: "POST",
        headers: {
          ..._requestHeaders(connection.headers),
          Authorization: `Bearer ${connection.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelId,
          prompt,
          ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
          ...(dimensions ?? {}),
          response_format: "url",
          ...(input.seed !== undefined ? { seed: input.seed } : {}),
          n: 1,
          prompt_optimizer: input.promptOptimizer ?? true,
        }),
        signal: input.signal,
      }
    );
    const body = await _readResponse(response);
    const statusCode = body.base_resp?.status_code;
    if (!response.ok || (statusCode !== undefined && Number(statusCode) !== 0)) {
      throw _providerError(body, `HTTP ${response.status}`);
    }

    const image = await _readImage(body, fetchImpl, input.signal);
    return {
      ...image,
      model: modelId,
      size: aspectRatio ?? `${dimensions?.width}x${dimensions?.height}`,
    };
  };
}

/** Bind MiniMax image generation to the shared connection resolver. */
export function createConfiguredMiniMaxImageGenerator({
  modelManager,
  env,
}: {
  modelManager: ModelManager;
  env: Record<string, string | undefined>;
}) {
  return createMiniMaxImageGenerator({
    getConfig: () => modelManager.getMiniMaxImageGenerationConfig(),
    resolveConnection: (connection) =>
      modelManager.resolveConnection(connection, {
        fallbackApiKey: env.MINIMAX_API_KEY,
      }),
  });
}

function _dimensions(input: MiniMaxImageGenerationInput):
  | { width: number; height: number }
  | undefined {
  if (input.width === undefined && input.height === undefined) {
    return undefined;
  }
  if (input.width === undefined || input.height === undefined) {
    throw new Error("width and height must be provided together.");
  }
  for (const [name, value] of [
    ["width", input.width],
    ["height", input.height],
  ] as const) {
    if (!Number.isInteger(value) || value < 512 || value > 2048 || value % 8) {
      throw new Error(
        `${name} must be between 512 and 2048 pixels and divisible by 8.`
      );
    }
  }
  return { width: input.width, height: input.height };
}

function _imageGenerationUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/image_generation")
    ? normalized
    : `${normalized}/image_generation`;
}

function _requestHeaders(
  headers: Record<string, string> | undefined
): Record<string, string> {
  return { ...(headers ?? {}) };
}

async function _readResponse(response: Response): Promise<MiniMaxImageResponse> {
  const text = await response.text();
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object") {
      throw new Error();
    }
    return value;
  } catch {
    throw new Error(
      `MiniMax image generation returned invalid JSON (HTTP ${response.status}).`
    );
  }
}

function _providerError(
  body: MiniMaxImageResponse,
  fallback: string
): Error {
  const rawCode = body.base_resp?.status_code;
  const code =
    typeof rawCode === "string" || typeof rawCode === "number"
      ? String(rawCode)
      : fallback;
  const message = body.base_resp?.status_msg;
  return new Error(
    `MiniMax image generation failed (${code}): ${typeof message === "string" && message.trim() ? message.trim() : "Request failed."}`
  );
}

async function _readImage(
  body: MiniMaxImageResponse,
  fetchImpl: FetchLike,
  signal: AbortSignal | undefined
): Promise<{ data: string; mimeType: string }> {
  const base64Values = Array.isArray(body.data?.image_base64)
    ? body.data.image_base64
    : [];
  const base64 = base64Values.find(
    (value): value is string => typeof value === "string" && value.length > 0
  );
  if (base64) {
    return _normalizeBase64Image(base64);
  }

  const urls = Array.isArray(body.data?.image_urls)
    ? body.data.image_urls
    : [];
  const url = urls.find(
    (value): value is string => typeof value === "string" && value.length > 0
  );
  if (!url) {
    throw new Error("MiniMax image generation returned no image data.");
  }
  const response = await fetchImpl(url, { signal });
  if (!response.ok) {
    throw new Error(
      `MiniMax image download failed (HTTP ${response.status}).`
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error("MiniMax image generation returned empty image data.");
  }
  return {
    data: Buffer.from(bytes).toString("base64"),
    mimeType: response.headers.get("content-type")?.split(";")[0] || "image/jpeg",
  };
}

function _normalizeBase64Image(value: string): {
  data: string;
  mimeType: string;
} {
  const dataUrl = /^data:([^;,]+);base64,(.+)$/s.exec(value);
  const data = (dataUrl?.[2] ?? value).replace(/\s/g, "");
  if (!data || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    throw new Error("MiniMax image generation returned malformed base64 data.");
  }
  const bytes = Buffer.from(data, "base64");
  if (bytes.length === 0) {
    throw new Error("MiniMax image generation returned empty image data.");
  }
  return {
    data,
    mimeType: dataUrl?.[1] ?? "image/jpeg",
  };
}
