import type { Api, Model } from "@earendil-works/pi-ai";

import type { ResponseType } from "../../types/models/response-type";

/**
 * The name pi/OpenAI/Anthropic require for a JSON-schema response format. The
 * schema editor only captures the schema itself, so we supply a stable name.
 */
const SCHEMA_NAME = "response";

/**
 * Translate a configured `responseType` into a provider-specific structured
 * output request by mutating the outgoing provider payload.
 *
 * pi-ai exposes no first-class `response_format`/`json_schema` option, so this
 * runs through the `onPayload` escape hatch: it receives the fully-built request
 * body right before it is sent and rewrites the field each provider expects,
 * keyed off `model.api`. Unsupported APIs (and the default `text` type) leave
 * the payload untouched so the provider falls back to plain text.
 */
export function applyResponseFormat(
  payload: unknown,
  model: Model<Api>,
  responseType: ResponseType
): unknown {
  // "text" is the provider default — nothing to inject.
  if (responseType.type === "text") return payload;
  if (!payload || typeof payload !== "object") return payload;

  const body = payload as Record<string, unknown>;
  const schema =
    responseType.type === "json_schema" ? responseType.jsonSchema : undefined;

  switch (model.api) {
    case "openai-completions": {
      body.response_format = schema
        ? {
            type: "json_schema",
            json_schema: { name: SCHEMA_NAME, schema, strict: true },
          }
        : { type: "json_object" };
      return body;
    }
    case "openai-responses":
    case "azure-openai-responses": {
      body.text = {
        ...(body.text as Record<string, unknown> | undefined),
        format: schema
          ? { type: "json_schema", name: SCHEMA_NAME, schema, strict: true }
          : { type: "json_object" },
      };
      return body;
    }
    case "anthropic-messages": {
      // Anthropic's structured outputs only accept a JSON Schema
      // (`output_config.format`); there is no plain "json object" mode, so a
      // json_object request falls back to default text behavior.
      if (!schema) return payload;
      body.output_config = {
        format: { type: "json_schema", name: SCHEMA_NAME, schema },
      };
      return body;
    }
    case "google-generative-ai":
    case "google-vertex": {
      // The @google/genai SDK carries generation settings on `config`.
      const config: Record<string, unknown> = {
        ...((body.config as Record<string, unknown> | undefined) ?? {}),
        responseMimeType: "application/json",
      };
      if (schema) config.responseSchema = schema;
      body.config = config;
      return body;
    }
    default:
      // Unknown/unsupported API — leave the payload untouched.
      return payload;
  }
}
