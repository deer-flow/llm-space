import { Compile } from "typebox/compile";

import { Thread } from "../types";

import { normalizeToThread } from "./normalize-thread";
import type { ThreadParseContext, ThreadParser } from "./thread-parser";

const _threadValidator = Compile(Thread);

/**
 * Parses a `.json` thread file. Content that already matches our internal
 * {@link Thread} shape is imported as-is; otherwise it is normalized from a
 * foreign chat format (OpenAI ChatCompletion / Anthropic Messages).
 */
export class JsonThreadParser implements ThreadParser {
  readonly extensions = [".json"] as const;

  parse(
    raw: string,
    context?: ThreadParseContext
  ): Promise<Thread | undefined> {
    return Promise.resolve(_parse(raw, context));
  }
}

function _parse(raw: string, context?: ThreadParseContext): Thread | undefined {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (data === null || typeof data !== "object") {
    return undefined;
  }
  // A native Thread never has a top-level `messages` array (its messages live
  // under `context`). Guarding on that prevents a foreign `{ messages: [...] }`
  // dump — which validates as an *empty* Thread since all fields are optional
  // and extra keys are allowed — from short-circuiting and dropping its data.
  if (!_looksForeign(data) && _threadValidator.Check(data)) {
    return data;
  }
  return normalizeToThread(data, context);
}

function _looksForeign(data: object): boolean {
  return (
    Array.isArray(data) ||
    Array.isArray((data as Record<string, unknown>).messages) ||
    _looksLangfuseObservationsPayload(data)
  );
}

function _looksLangfuseObservationsPayload(data: object): boolean {
  const rows = (data as Record<string, unknown>).data;
  return Array.isArray(rows) && rows.some(_looksLangfuseObservation);
}

function _looksLangfuseObservation(row: unknown): boolean {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    return false;
  }
  const observation = row as Record<string, unknown>;
  const traceId = observation.traceId ?? observation.trace_id;
  return typeof traceId === "string" && typeof observation.id === "string";
}
