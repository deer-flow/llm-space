import { Type, type Static } from "typebox";

const JSON_VALUE_REF = "#/$defs/JsonValue";

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const JSON_VALUE_DEFINITIONS = {
  JsonValue: Type.Union([
    Type.Null(),
    Type.Boolean(),
    Type.Number(),
    Type.String(),
    Type.Array(Type.Ref(JSON_VALUE_REF)),
    Type.Record(Type.String(), Type.Ref(JSON_VALUE_REF)),
  ]),
};

export const JsonValue = Type.Unsafe<JsonValue>({
  $defs: JSON_VALUE_DEFINITIONS,
  $ref: JSON_VALUE_REF,
});

export const JsonObject = Type.Record(Type.String(), JsonValue);
export type JsonObject = Static<typeof JsonObject>;
