import { describe, expect, test } from "bun:test";

import { type ArkImageGenerationConfig } from "@llm-space/core";

import {
  createArkImageGenerator,
  type ArkImageGenerationDependencies,
} from "./ark-image-generation";

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
    getApiKey: () => Promise.resolve("test-key"),
    getBaseUrl: () => "https://ark.example/api/v3/",
    getHeaders: () => ({ "X-Fixture": "fixture" }),
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
        getApiKey: (profileId) => {
          resolved.push(`key:${profileId}`);
          return Promise.resolve("work-key");
        },
        getBaseUrl: (profileId) => {
          resolved.push(`url:${profileId}`);
          return "https://work.example/api/v3/";
        },
        getHeaders: (profileId) => {
          resolved.push(`headers:${profileId}`);
          return { "X-Profile": "work" };
        },
      })
    );

    await generate({ ...DEFAULT_INPUT, profileId: "profile-work" });

    expect(resolved).toEqual([
      "key:profile-work",
      "url:profile-work",
      "headers:profile-work",
    ]);
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
    controller.abort();
    let receivedSignal: AbortSignal | null | undefined;
    const generate = createArkImageGenerator(
      _dependencies({
        fetch: (_input, init) => {
          receivedSignal = init?.signal;
          return Promise.reject(new DOMException("Aborted", "AbortError"));
        },
      })
    );

    expect(
      generate({ ...DEFAULT_INPUT, signal: controller.signal })
    ).rejects.toThrow("Ark image generation was aborted");
    expect(receivedSignal).toBe(controller.signal);
  });
});
