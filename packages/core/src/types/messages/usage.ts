import { Type, type Static } from "typebox";

/**
 * Provider-reported monetary cost for a completed model call. Values are copied
 * from the model provider adapter and are not reconciled against billing data.
 */
export const ModelUsageCost = Type.Object({
  input: Type.Number(),
  output: Type.Number(),
  cacheRead: Type.Number(),
  cacheWrite: Type.Number(),
  total: Type.Number(),
});
export type ModelUsageCost = Static<typeof ModelUsageCost>;

/**
 * Provider-reported token usage for a completed assistant/model step.
 *
 * The field is optional on messages because not every provider reports usage,
 * and older thread files were saved before LLM Space retained this data.
 */
export const ModelUsage = Type.Object({
  input: Type.Number(),
  output: Type.Number(),
  cacheRead: Type.Number(),
  cacheWrite: Type.Number(),
  reasoning: Type.Optional(Type.Number()),
  totalTokens: Type.Number(),
  cost: ModelUsageCost,
});
export type ModelUsage = Static<typeof ModelUsage>;
