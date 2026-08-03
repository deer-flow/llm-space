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

type JsonSchemaObject = Record<string, unknown>;

const ZodThreadJsonSchema = _hoistJsonSchemaDefinitions(
  ThreadJsonSchema as unknown as JsonSchemaObject
);
const ZodPersistedThreadJsonSchema = _hoistJsonSchemaDefinitions(
  PersistedThreadJsonSchema
);

/** Zod boundary for in-memory native threads. */
export const ThreadZodSchema = z.preprocess(
  _normalizeLegacyProviderHostedData,
  z.fromJSONSchema(ZodThreadJsonSchema)
) as z.ZodType<Thread>;

/** Zod boundary for the packed, self-contained workspace file shape. */
export const PersistedThreadZodSchema = z.preprocess(
  _normalizeLegacyProviderHostedData,
  z.fromJSONSchema(ZodPersistedThreadJsonSchema)
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

/** Zod resolves local references from the document root only. */
function _hoistJsonSchemaDefinitions(
  schema: JsonSchemaObject
): JsonSchemaObject {
  const definitions: JsonSchemaObject = {};
  const normalized = _collectJsonSchemaDefinitions(schema, definitions);

  return Object.keys(definitions).length === 0
    ? normalized
    : { ...normalized, $defs: definitions };
}

function _collectJsonSchemaDefinitions(
  value: JsonSchemaObject,
  definitions: JsonSchemaObject
): JsonSchemaObject {
  const normalized: JsonSchemaObject = {};

  for (const [key, child] of Object.entries(value)) {
    if (key === "$defs" && _isJsonSchemaObject(child)) {
      for (const [name, definition] of Object.entries(child)) {
        const normalizedDefinition = _normalizeJsonSchemaValue(
          definition,
          definitions
        );
        if (
          Object.hasOwn(definitions, name) &&
          JSON.stringify(definitions[name]) !==
            JSON.stringify(normalizedDefinition)
        ) {
          throw new Error(`Conflicting JSON Schema definition: ${name}`);
        }
        definitions[name] = normalizedDefinition;
      }
      continue;
    }

    normalized[key] = _normalizeJsonSchemaValue(child, definitions);
  }

  return normalized;
}

function _normalizeJsonSchemaValue(
  value: unknown,
  definitions: JsonSchemaObject
): unknown {
  if (Array.isArray(value)) {
    return (value as unknown[]).map((item) =>
      _normalizeJsonSchemaValue(item, definitions)
    );
  }
  return _isJsonSchemaObject(value)
    ? _collectJsonSchemaDefinitions(value, definitions)
    : value;
}

function _isJsonSchemaObject(value: unknown): value is JsonSchemaObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Rewrite the feature branch's pre-rename persisted fields before validation. */
function _normalizeLegacyProviderHostedData(value: unknown): unknown {
  if (!_isJsonSchemaObject(value)) return value;

  let next = value;
  const context = value.context;
  if (_isJsonSchemaObject(context)) {
    let nextContext = context;
    if (Array.isArray(context.tools)) {
      let changed = false;
      const tools = (context.tools as unknown[]).map(
        (tool: unknown): unknown => {
        if (
          _isJsonSchemaObject(tool) &&
          tool.type === "response-api-native"
        ) {
          changed = true;
          return { ...tool, type: "provider-hosted" };
        }
        return tool;
        }
      );
      if (changed) nextContext = { ...nextContext, tools };
    }
    if (Array.isArray(context.messages)) {
      let changed = false;
      const messages = (context.messages as unknown[]).map(
        (message: unknown): unknown => {
        if (
          !_isJsonSchemaObject(message) ||
          !("nativeToolActivities" in message)
        ) {
          return message;
        }
        changed = true;
        const { nativeToolActivities, ...rest } = message;
        return rest.providerHostedToolActivities !== undefined ||
          nativeToolActivities === undefined
          ? rest
          : {
              ...rest,
              providerHostedToolActivities: nativeToolActivities,
            };
        }
      );
      if (changed) nextContext = { ...nextContext, messages };
    }
    if (nextContext !== context) next = { ...next, context: nextContext };
  }

  if (Array.isArray(value.runHistory)) {
    let changed = false;
    const runHistory = (value.runHistory as unknown[]).map(
      (run: unknown): unknown => {
        if (!_isJsonSchemaObject(run) || !("thread" in run)) return run;
        const thread = _normalizeLegacyProviderHostedData(run.thread);
        if (thread === run.thread) return run;
        changed = true;
        return { ...run, thread };
      }
    );
    if (changed) next = { ...next, runHistory };
  }

  return next;
}

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
