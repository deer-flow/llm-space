import { Type, type Static } from "typebox";

import { JsonObject, JsonValue } from "../shared";

export const ProviderHostedToolSource = Type.Object({
  url: Type.String(),
  title: Type.Optional(Type.String()),
});
export type ProviderHostedToolSource = Static<typeof ProviderHostedToolSource>;

export const ProviderHostedToolActivity = Type.Object({
  id: Type.Optional(Type.String()),
  type: Type.String(),
  status: Type.Optional(Type.String()),
  action: Type.Optional(JsonObject),
  result: Type.Optional(JsonValue),
  sources: Type.Optional(Type.Array(ProviderHostedToolSource)),
  raw: JsonObject,
});
export type ProviderHostedToolActivity = Static<
  typeof ProviderHostedToolActivity
>;

export const ResponseOutputItem = JsonObject;
export type ResponseOutputItem = Static<typeof ResponseOutputItem>;
