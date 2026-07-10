import { Type, type Static } from "typebox";

export {
  JSONObject,
  JSONValue,
  isJSONValue,
  type JSONObject as JSONObjectType,
  type JSONValue as JSONValueType,
} from "@llm-space/plugin-api";

export const JSONSchema = Type.Object({}, { additionalProperties: true });
export type JSONSchema = Static<typeof JSONSchema>;
