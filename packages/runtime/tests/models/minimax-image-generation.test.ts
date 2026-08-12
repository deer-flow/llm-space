import { describe, expect, test } from "bun:test";

import {
  createMiniMaxImageGenerator,
  type MiniMaxImageGenerationDependencies,
} from "../../src/models/minimax-image-generation";

function _dependencies(
  overrides: Partial<MiniMaxImageGenerationDependencies> = {}
): MiniMaxImageGenerationDependencies {
  return {
    getConfig: () => ({}),
    resolveConnection: () =>
      Promise.resolve({ apiKey: "test-key" }),
    ...overrides,
  };
}

function _inputUrl(input: string | URL | Request): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

function _jsonBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string") {
    throw new Error("Expected a JSON request body.");
  }
  return JSON.parse(init.body);
}

describe("MiniMax image generation", () => {
  test("adapts a global request and downloads the returned image URL", async () => {
    const requests: { input: string; init?: RequestInit }[] = [];
    const generate = createMiniMaxImageGenerator(
      _dependencies({
        fetch: (input, init) => {
          requests.push({ input: _inputUrl(input), init });
          if (requests.length === 1) {
            return Promise.resolve(
              Response.json({
                data: { image_urls: ["https://images.example/result.png"] },
                metadata: { success_count: "1", failed_count: "0" },
                base_resp: { status_code: 0, status_msg: "success" },
              })
            );
          }
          return Promise.resolve(
            new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
              headers: { "Content-Type": "image/png" },
            })
          );
        },
      })
    );

    const result = await generate({
      prompt: "A blue square",
      aspectRatio: "16:9",
    });
    expect(result).toEqual({
      data: "iVBORw==",
      mimeType: "image/png",
      model: "image-01",
      size: "16:9",
    });
    expect(requests[0]?.input).toBe(
      "https://api.minimax.io/v1/image_generation"
    );
    expect(requests[0]?.init?.headers).toEqual({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
    });
    expect(_jsonBody(requests[0]?.init)).toEqual({
      model: "image-01",
      prompt: "A blue square",
      aspect_ratio: "16:9",
      response_format: "url",
      n: 1,
      prompt_optimizer: true,
    });
    expect(requests[1]?.input).toBe("https://images.example/result.png");
  });

  test("supports the China endpoint and explicit dimensions", async () => {
    let requestedUrl = "";
    let payload: unknown;
    const generate = createMiniMaxImageGenerator(
      _dependencies({
        resolveConnection: () =>
          Promise.resolve({
            apiKey: "test-key",
            baseUrl: "https://api.minimaxi.com/v1",
          }),
        fetch: (input, init) => {
          requestedUrl = _inputUrl(input);
          payload = _jsonBody(init);
          return Promise.resolve(
            Response.json({
              data: { image_base64: ["aW1hZ2U="] },
              base_resp: { status_code: 0, status_msg: "success" },
            })
          );
        },
      })
    );

    const result = await generate({
      prompt: "A green circle",
      model: "image-01-live",
      width: 1024,
      height: 768,
      seed: 42,
      promptOptimizer: false,
    });
    expect(result).toMatchObject({
      data: "aW1hZ2U=",
      model: "image-01-live",
      size: "1024x768",
    });
    expect(requestedUrl).toBe(
      "https://api.minimaxi.com/v1/image_generation"
    );
    expect(payload).toEqual({
      model: "image-01-live",
      prompt: "A green circle",
      width: 1024,
      height: 768,
      response_format: "url",
      seed: 42,
      n: 1,
      prompt_optimizer: false,
    });
  });

  test("reports provider status errors without returning raw response data", async () => {
    const generate = createMiniMaxImageGenerator(
      _dependencies({
        fetch: () =>
          Promise.resolve(
            Response.json({
              base_resp: { status_code: 1008, status_msg: "Invalid request" },
            })
          ),
      })
    );

    let message = "";
    try {
      await generate({ prompt: "A red triangle" });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe(
      "MiniMax image generation failed (1008): Invalid request"
    );
  });
});
