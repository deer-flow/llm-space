import { Type, type Static } from "typebox";

import { ReasoningLevel } from "./reasoning-level";
import { ResponseType } from "./response-type";

export const ModelConfigParams = Type.Object({
  // Common
  maxTokens: Type.Optional(Type.Number({ minimum: 1 })),
  temperature: Type.Optional(Type.Number({ minimum: 0, maximum: 2 })),
  reasoning: Type.Optional(ReasoningLevel),
  responseType: Type.Optional(ResponseType),

  // Model specific parameters
  extra: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});
export type ModelConfigParams = Static<typeof ModelConfigParams>;

/**
 * The definition of a runtime model.
 */
export const ModelConfig = Type.Object({
  /**
   * The provider name of the model.
   */
  provider: Type.String(),

  /**
   * The id of the model.
   */
  id: Type.String(),

  /**
   * The runtime parameters of the model.
   */
  params: Type.Optional(ModelConfigParams),
});
export type ModelConfig = Static<typeof ModelConfig>;
