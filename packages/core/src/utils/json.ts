import { parse } from "best-effort-json-parser";
import type * as z from "zod";

export type JsonParseResult<T> =
  | { status: "strict"; value: T }
  | { status: "recovered"; value: T }
  | { status: "invalid-json"; error: Error }
  | { status: "invalid-shape"; error: z.ZodError };

export function parseJsonWithSchema<T>(
  text: string,
  schema: z.ZodType<T>,
  options: {
    recovery?: "none" | "best-effort";
    recoverySchema?: z.ZodType<T>;
  } = {}
): JsonParseResult<T> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (strictError) {
    if (options.recovery !== "best-effort") {
      return {
        status: "invalid-json",
        error: _asError(strictError),
      };
    }
    try {
      value = parse(text);
    } catch (recoveryError) {
      return {
        status: "invalid-json",
        error: _asError(recoveryError),
      };
    }
    const recovered = (options.recoverySchema ?? schema).safeParse(value);
    return recovered.success
      ? { status: "recovered", value: recovered.data }
      : { status: "invalid-shape", error: recovered.error };
  }

  const strict = schema.safeParse(value);
  return strict.success
    ? { status: "strict", value: strict.data }
    : { status: "invalid-shape", error: strict.error };
}

export function parseJSON<T>(text: string): T {
  return parse(text) as T;
}

export function deepCloneJSON<T>(o: T): T {
  return JSON.parse(JSON.stringify(o)) as T;
}

function _asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
