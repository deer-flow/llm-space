import * as z from "zod";

import { Thread as ThreadJsonSchema, type Thread } from "./thread";

const PersistedThreadJsonSchema = {
  ...ThreadJsonSchema,
  properties: {
    ...ThreadJsonSchema.properties,
    blobs: {
      type: "object" as const,
      additionalProperties: { type: "string" as const },
    },
  },
};

/** Zod boundary for in-memory native threads. */
export const ThreadZodSchema = z.fromJSONSchema(
  ThreadJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]
) as z.ZodType<Thread>;

/** Zod boundary for the packed, self-contained workspace file shape. */
export const PersistedThreadZodSchema = z.fromJSONSchema(
  PersistedThreadJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]
) as z.ZodType<Thread & { blobs?: Record<string, string> }>;

/** Recovery must retain at least one recognizable thread field. */
export const RecoverableThreadZodSchema = ThreadZodSchema.refine(
  _hasRecognizableThreadData,
  "Recovered JSON contains no recognizable thread fields."
);

export const RecoverablePersistedThreadZodSchema =
  PersistedThreadZodSchema.refine(
    _hasRecognizableThreadData,
    "Recovered JSON contains no recognizable thread fields."
  );

function _hasRecognizableThreadData(value: Thread): boolean {
  return [
    "title",
    "model",
    "context",
    "runHistory",
    "evaluations",
    "evaluationRubrics",
    "modelName",
    "runtimeId",
    "originalURL",
  ].some((key) => key in value);
}
