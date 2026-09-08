import { describe, expect, test } from "bun:test";

import { type ArkImageGenerationConfig } from "@llm-space/core";

import {
  createArkImageGenerator,
  createConfiguredArkImageGenerator,
  type ArkImageGenerationDependencies,
} from "../../src/models/ark-image-generation";
import type { ModelManager } from "../../src/models/model-manager";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X2NDWQAAAABJRU5ErkJggg==";
const DEFAULT_MODEL = "doubao-seedream-5-0-pro-260628";
const DEFAULT_INPUT = {
  prompt: "A red circle",
  model: DEFAULT_MODEL,
  size: "2K",
  watermark: true,
} as const;

function _dependencies(
  overrides: Partial<ArkImageGenerationDependencies> = {}
): ArkImageGenerationDependencies {
  const config: ArkImageGenerationConfig = {};
  return {
    getConfig: () => config,
    resolveConnection: () =>
      Promise.resolve({
        apiKey: "test-key",
        baseUrl: "https://ark.example/api/v3/",
        headers: { "X-Fixture": "fixture" },
      }),
    fetch: () =>
      Promise.resolve(
        Response.json({
          model: DEFAULT_MODEL,
          data: [{ b64_json: PNG_BASE64, size: "2048x2048" }],
        })
      ),
    ...overrides,
  };
}

describe("Ark image generation", () => {
  test("sends native Ark fields and returns structured image metadata", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const generate = createArkImageGenerator(
      _dependencies({
        fetch: (input, init) => {
          requestUrl =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.href
                : input.url;
          requestInit = init;
          return Promise.resolve(
            Response.json({
              model: "doubao-seedream-5-0-pro-260628",
              data: [{ b64_json: PNG_BASE64, size: "2048x2048" }],
            })
          );
        },
      })
    );

    expect(await generate({ ...DEFAULT_INPUT, size: "1K" })).toEqual({
      data: PNG_BASE64,
      mimeType: "image/png",
      model: "doubao-seedream-5-0-pro-260628",
      size: "2048x2048",
    });
    expect(requestUrl).toBe("https://ark.example/api/v3/images/generations");
    expect(requestInit?.headers).toEqual({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
      "X-Fixture": "fixture",
    });
    const requestBody = requestInit?.body;
    if (typeof requestBody !== "string") {
      throw new Error("Expected a JSON request body.");
    }
    expect(JSON.parse(requestBody)).toEqual({
      model: "doubao-seedream-5-0-pro-260628",
      prompt: "A red circle",
      response_format: "b64_json",
      size: "1K",
      stream: false,
      watermark: true,
    });
  });

  test("resolves credentials and endpoint settings from the selected profile", async () => {
    const resolved: string[] = [];
    const generate = createArkImageGenerator(
      _dependencies({
        resolveConnection: (connection) => {
          resolved.push(
            `${connection.providerId}:${connection.profileId ?? "default"}`
          );
          return Promise.resolve({
            apiKey: "work-key",
            baseUrl: "https://work.example/api/v3/",
            headers: { "X-Profile": "work" },
          });
        },
      })
    );

    await generate({
      ...DEFAULT_INPUT,
      connection: { providerId: "ark", profileId: "profile-work" },
    });

    expect(resolved).toEqual(["ark:profile-work"]);
  });

  test("fails before fetch when Ark image settings are missing", () => {
    let calls = 0;
    const generate = createArkImageGenerator(
      _dependencies({
        getConfig: () => undefined,
        fetch: () => {
          calls += 1;
          return Promise.resolve(Response.json({}));
        },
      })
    );

    expect(generate(DEFAULT_INPUT)).rejects.toThrow(
      "Configure Image generation"
    );
    expect(calls).toBe(0);
  });

  test("rejects a size unsupported by the configured model", () => {
    const generate = createArkImageGenerator(_dependencies());

    expect(generate({ ...DEFAULT_INPUT, size: "4K" })).rejects.toThrow(
      "Seedream 5.0 Pro does not support the 4K size preset"
    );
  });

  test("calls the user-added image model selected by the tool", async () => {
    let requestBody: unknown;
    const config: ArkImageGenerationConfig = {
      models: [
        {
          id: "ep-seedream-custom",
          name: "Custom Seedream endpoint",
          supportedSizes: ["2K", "4K"],
          defaultSize: "2K",
        },
      ],
    };
    const generate = createArkImageGenerator(
      _dependencies({
        getConfig: () => config,
        fetch: (_input, init) => {
          if (typeof init?.body !== "string") {
            throw new Error("Expected a JSON request body.");
          }
          requestBody = JSON.parse(init.body);
          return Promise.resolve(
            Response.json({
              model: "ep-seedream-custom",
              data: [{ b64_json: PNG_BASE64, size: "4096x4096" }],
            })
          );
        },
      })
    );

    expect(
      await generate({
        ...DEFAULT_INPUT,
        model: "ep-seedream-custom",
        size: "4K",
        watermark: false,
      })
    ).toMatchObject({
      model: "ep-seedream-custom",
      size: "4096x4096",
    });
    expect(requestBody).toMatchObject({
      model: "ep-seedream-custom",
      size: "4K",
      watermark: false,
    });
  });

  test("fails before fetch when every image model is disabled", () => {
    let calls = 0;
    const config: ArkImageGenerationConfig = {
      disabledModels: [DEFAULT_MODEL],
    };
    const generate = createArkImageGenerator(
      _dependencies({
        getConfig: () => config,
        fetch: () => {
          calls += 1;
          return Promise.resolve(Response.json({}));
        },
      })
    );

    expect(generate(DEFAULT_INPUT)).rejects.toThrow(
      'configured Ark image model "Seedream 5.0 Pro" is disabled'
    );
    expect(calls).toBe(0);
  });

  test("preserves Ark error codes without exposing response payloads", () => {
    const generate = createArkImageGenerator(
      _dependencies({
        fetch: () =>
          Promise.resolve(
            Response.json(
              {
                error: {
                  code: "InputTextSensitiveContentDetected",
                  message: "The prompt was rejected.",
                  secret: "must-not-appear",
                },
              },
              { status: 400 }
            )
          ),
      })
    );

    expect(generate(DEFAULT_INPUT)).rejects.toThrow(
      "Ark image generation failed (InputTextSensitiveContentDetected): The prompt was rejected."
    );
  });

  test("reports malformed base64 as a provider result error", () => {
    const generate = createArkImageGenerator(
      _dependencies({
        fetch: () =>
          Promise.resolve(
            Response.json({ data: [{ b64_json: "not base64!" }] })
          ),
      })
    );

    expect(generate(DEFAULT_INPUT)).rejects.toThrow("malformed base64");
  });

  test("propagates the abort signal to fetch", () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | null | undefined;
    const generate = createArkImageGenerator(
      _dependencies({
        fetch: (_input, init) => {
          receivedSignal = init?.signal;
          controller.abort();
          return Promise.reject(new DOMException("Aborted", "AbortError"));
        },
      })
    );

    expect(
      generate({ ...DEFAULT_INPUT, signal: controller.signal })
    ).rejects.toThrow("Ark image generation was aborted");
    expect(receivedSignal).toBe(controller.signal);
  });

  test("uses a custom provider connection and Agnes-compatible payload", async () => {
    let requestUrl = "";
    let requestHeaders: HeadersInit | undefined;
    let requestBody: unknown;
    const generate = createArkImageGenerator(
      _dependencies({
        getConfig: (providerId) =>
          providerId === "agnes"
            ? {
                api: "openai-images-extra-body",
                models: [
                  {
                    id: "agnes-image-2.5-flash",
                    name: "Agnes Image 2.5 Flash",
                    supportedSizes: ["1K", "2K", "3K", "4K"],
                    defaultSize: "2K",
                  },
                ],
              }
            : undefined,
        resolveConnection: (connection) => {
          expect(connection).toEqual({
            providerId: "agnes",
            profileId: "agnes-default",
          });
          return Promise.resolve({
            apiKey: "agnes-key",
            baseUrl: "https://api.agnes-ai.cn/v1/",
            headers: { "X-Tenant": "test" },
          });
        },
        fetch: (input, init) => {
          requestUrl =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.href
                : input.url;
          requestHeaders = init?.headers;
          requestBody =
            typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
          return Promise.resolve(
            Response.json({
              model: "agnes-image-2.5-flash",
              data: [{ b64_json: PNG_BASE64, size: "2048x2048" }],
            })
          );
        },
      })
    );

    await generate({
      prompt: "A red circle",
      model: "agnes-image-2.5-flash",
      size: "2K",
      watermark: false,
      connection: {
        providerId: "agnes",
        profileId: "agnes-default",
      },
    });

    expect(requestUrl).toBe("https://api.agnes-ai.cn/v1/images/generations");
    expect(requestHeaders).toMatchObject({
      Authorization: "Bearer agnes-key",
      "X-Tenant": "test",
    });
    expect(requestBody).toEqual({
      model: "agnes-image-2.5-flash",
      prompt: "A red circle",
      size: "2K",
      return_base64: true,
      extra_body: { response_format: "b64_json" },
    });
  });

  test("uses standard OpenAI sizes and omits response_format for GPT Image", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const generate = createArkImageGenerator(
      _dependencies({
        getConfig: () => ({
          api: "openai-images",
          models: [
            {
              id: "gpt-image-1",
              name: "GPT Image 1",
              supportedSizes: ["1024x1024"],
              defaultSize: "1024x1024",
            },
          ],
        }),
        fetch: (_input, init) => {
          const parsed: unknown =
            typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
          requestBody =
            parsed && typeof parsed === "object"
              ? (parsed as Record<string, unknown>)
              : undefined;
          return Promise.resolve(
            Response.json({
              model: "gpt-image-1",
              data: [{ b64_json: PNG_BASE64, size: "1024x1024" }],
            })
          );
        },
      })
    );

    await generate({
      prompt: "A red circle",
      model: "gpt-image-1",
      size: "1024x1024",
      watermark: false,
      connection: { providerId: "openai-images" },
    });

    expect(requestBody).toEqual({
      model: "gpt-image-1",
      prompt: "A red circle",
      size: "1024x1024",
    });
  });

  test("requests base64 explicitly for DALL-E and migrates legacy 1K", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const generate = createArkImageGenerator(
      _dependencies({
        getConfig: () => ({
          api: "openai-images",
          models: [
            {
              id: "dall-e-3",
              name: "DALL-E 3",
              supportedSizes: ["1K"],
              defaultSize: "1K",
            },
          ],
        }),
        fetch: (_input, init) => {
          const parsed: unknown =
            typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
          requestBody =
            parsed && typeof parsed === "object"
              ? (parsed as Record<string, unknown>)
              : undefined;
          return Promise.resolve(
            Response.json({
              model: "dall-e-3",
              data: [{ b64_json: PNG_BASE64, size: "1024x1024" }],
            })
          );
        },
      })
    );

    await generate({
      prompt: "A red circle",
      model: "dall-e-3",
      size: "1K",
      watermark: false,
      connection: { providerId: "openai-images" },
    });

    expect(requestBody).toEqual({
      model: "dall-e-3",
      prompt: "A red circle",
      response_format: "b64_json",
      size: "1024x1024",
    });
  });

  test("rejects ambiguous non-1K presets in standard OpenAI mode", async () => {
    let calls = 0;
    const generate = createArkImageGenerator(
      _dependencies({
        getConfig: () => ({
          api: "openai-images",
          models: [
            {
              id: "gpt-image-1",
              name: "GPT Image 1",
              supportedSizes: ["2K"],
              defaultSize: "2K",
            },
          ],
        }),
        fetch: () => {
          calls += 1;
          return Promise.resolve(Response.json({}));
        },
      })
    );

    expect(
      generate({
        prompt: "A red circle",
        model: "gpt-image-1",
        size: "2K",
        watermark: false,
        connection: { providerId: "openai-images" },
      })
    ).rejects.toThrow("requires an explicit pixel size");
    expect(calls).toBe(0);
  });

  test("never falls back to the Ark key for a custom provider", async () => {
    let fallbackApiKey: string | undefined;
    const modelManager = {
      getImageGenerationConfig: () => ({
        api: "openai-images",
        models: [
          {
            id: "fixture",
            name: "Fixture",
            supportedSizes: ["1K"],
            defaultSize: "1K",
          },
        ],
      }),
      resolveConnection: (
        _connection: unknown,
        options: { fallbackApiKey?: string }
      ) => {
        fallbackApiKey = options.fallbackApiKey;
        return Promise.resolve({});
      },
    } as unknown as ModelManager;
    const generate = createConfiguredArkImageGenerator({
      modelManager,
      env: { ARK_API_KEY: "ark-secret-canary" },
    });

    expect(
      generate({
        prompt: "fixture",
        model: "fixture",
        size: "1K",
        watermark: false,
        connection: { providerId: "other-images" },
      })
    ).rejects.toThrow('Configure an API key for provider "other-images"');
    expect(fallbackApiKey).toBeUndefined();
  });
});
