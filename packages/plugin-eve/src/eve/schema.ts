import type { JSONSchema } from "@llm-space/core";

/**
 * Convert Eve's public input schema shape into LLM Space's JSON Schema value.
 * Zod v4 schemas expose `toJSONSchema()`, while already-plain JSON schemas are
 * passed through as-is.
 */
export function jsonSchemaFromEveInputSchema(
  schema: unknown
): JSONSchema | undefined {
  if (_isJsonSchemaEmitter(schema)) {
    const jsonSchema = schema.toJSONSchema();
    return _isJsonSchema(jsonSchema) ? jsonSchema : undefined;
  }
  if (_isJsonSchema(schema)) {
    return schema;
  }
  return undefined;
}

function _isJsonSchemaEmitter(
  schema: unknown
): schema is { toJSONSchema: () => unknown } {
  return (
    schema !== null &&
    typeof schema === "object" &&
    "toJSONSchema" in schema &&
    typeof schema.toJSONSchema === "function"
  );
}

function _isJsonSchema(value: unknown): value is JSONSchema {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
