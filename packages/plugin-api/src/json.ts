import { Type, type Static } from "typebox";

/** A value that can cross the plugin boundary or be persisted as JSON. */
export type JSONValue =
  null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };

/** A JSON object used for plugin context data, arguments, and metadata. */
export interface JSONObject extends Record<string, JSONValue> {}

/**
 * Recursive JSON-value schema shared by manifests, Thread plugin contexts, and
 * host storage. The explicit JSON Schema keeps functions, symbols, buffers,
 * undefined values, and cyclic objects outside the public contract.
 */
export const JSONValue = Type.Unsafe<JSONValue>({
  $defs: {
    JSONValue: {
      anyOf: [
        { type: "null" },
        { type: "boolean" },
        { type: "number" },
        { type: "string" },
        { type: "array", items: { $ref: "#/$defs/JSONValue" } },
        {
          type: "object",
          additionalProperties: { $ref: "#/$defs/JSONValue" },
        },
      ],
    },
  },
  $ref: "#/$defs/JSONValue",
});

export const JSONObject = Type.Unsafe<JSONObject>({
  type: "object",
  additionalProperties: JSONValue,
});

/** Whether a runtime value is finite, acyclic, and JSON-compatible. */
export function isJSONValue(value: unknown): value is JSONValue {
  return _isJSONValue(value, new Set<object>());
}

function _isJSONValue(value: unknown, stack: Set<object>): value is JSONValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value !== "object") {
    return false;
  }
  if (stack.has(value)) {
    return false;
  }
  stack.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => _isJSONValue(item, stack))
    : Object.getPrototypeOf(value) === Object.prototype &&
      Object.values(value).every((item) => _isJSONValue(item, stack));
  stack.delete(value);
  return valid;
}

export type JSONValueSchema = Static<typeof JSONValue>;
