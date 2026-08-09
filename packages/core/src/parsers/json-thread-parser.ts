import { z } from "zod";

import {
  Message,
  RecoverableThreadZodSchema,
  ThreadZodSchema,
  type Thread,
  type Tool,
  type ToolCall,
} from "../types";
import { parseJSON, parseJsonWithSchema, uuid } from "../utils";

import { normalizeToThread } from "./normalize-thread";
import type {
  ThreadParseContext,
  ThreadParseDiagnostic,
  ThreadParser,
} from "./thread-parser";

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
    return this.parseDetailed(raw, context).then((result) =>
      result.status === "parsed" ? result.thread : undefined
    );
  }

  parseDetailed(
    raw: string,
    context?: ThreadParseContext
  ): Promise<ThreadParseDiagnostic> {
    return Promise.resolve(_parseDetailed(raw, context));
  }
}

function _parseDetailed(
  raw: string,
  context?: ThreadParseContext
): ThreadParseDiagnostic {
  const parsed = parseJsonWithSchema(raw, z.unknown(), {
    recovery: "best-effort",
  });
  if (parsed.status === "invalid-json" || parsed.status === "invalid-shape") {
    return {
      status: parsed.status,
      message: "The file does not contain valid JSON.",
    };
  }
  const thread = _parseData(parsed.value, context);
  if (!thread) {
    return {
      status: "invalid-shape",
      message: "The JSON does not contain a recognized thread.",
    };
  }
  const validated = (
    parsed.status === "recovered" ? RecoverableThreadZodSchema : ThreadZodSchema
  ).safeParse(thread);
  if (!validated.success) {
    return {
      status: "invalid-shape",
      message: "The recovered thread has invalid or incomplete fields.",
    };
  }
  return {
    status: "parsed",
    thread: validated.data,
    recovered: parsed.status === "recovered",
  };
}

function _parseData(
  data: unknown,
  context?: ThreadParseContext
): Thread | undefined {
  if (data === null || typeof data !== "object") {
    return undefined;
  }
  if (_looksAuroraThread(data)) {
    return _parseAuroraThread(data);
  }
  // A native Thread never has a top-level `messages` array (its messages live
  // under `context`). Guarding on that prevents a foreign `{ messages: [...] }`
  // dump — which validates as an *empty* Thread since all fields are optional
  // and extra keys are allowed — from short-circuiting and dropping its data.
  if (!_looksForeign(data) && _looksNative(data)) {
    const native = ThreadZodSchema.safeParse(data);
    if (native.success) return native.data;
  }
  return normalizeToThread(data, context);
}

function _looksNative(data: object): boolean {
  return [
    "title",
    "model",
    "context",
    "runHistory",
    "runHistoryVersion",
    "runHistoryIndex",
    "evaluations",
    "evaluationRubrics",
    "modelName",
    "runtimeId",
    "originalURL",
  ].some((key) => key in data);
}

function _looksForeign(data: object): boolean {
  return (
    Array.isArray(data) ||
    Array.isArray((data as Record<string, unknown>).messages) ||
    _looksAuroraThread(data) ||
    _looksLangfuseObservationsPayload(data)
  );
}

function _looksAuroraThread(data: object): boolean {
  const root = data as Record<string, unknown>;
  return Array.isArray(root.Messages) && Array.isArray(root.Tools);
}

function _parseAuroraThread(data: object): Thread | undefined {
  const root = data as Record<string, unknown>;
  const rawMessages = root.Messages;
  if (!Array.isArray(rawMessages)) {
    return undefined;
  }

  const systemParts: string[] = [];
  const messages: Message[] = [];
  const toolCallsById = new Map<string, ToolCall>();

  for (const raw of rawMessages) {
    const m = _asRecord(raw);
    if (!m) {
      continue;
    }
    const role = _auroraRole(m.Role);
    const content = _asRecord(m.Content);
    const text = _auroraText(content);

    switch (role) {
      case "system":
        if (text) {
          systemParts.push(text);
        }
        break;

      case "user":
        if (text) {
          messages.push({
            id: uuid(),
            role: "user",
            content: [{ type: "text", text }],
          });
        }
        break;

      case "assistant": {
        const toolCalls = _auroraToolCalls(content?.ToolCalls);
        for (const toolCall of toolCalls) {
          toolCallsById.set(toolCall.id, toolCall);
        }
        if (text || toolCalls.length) {
          messages.push({
            id: uuid(),
            role: "assistant",
            content: text ? [{ type: "text", text }] : [],
            ...(toolCalls.length ? { toolCalls } : {}),
          });
        }
        break;
      }

      case "tool": {
        const toolCallId =
          typeof m.ToolCallID === "string" ? m.ToolCallID : undefined;
        const toolCall = toolCallId ? toolCallsById.get(toolCallId) : undefined;
        if (toolCall && text) {
          toolCall.output = { content: [{ type: "text", text }] };
        }
        break;
      }

      default:
        break;
    }
  }

  const tools = _auroraTools(root.Tools);
  const thread: Thread = { context: {} };
  const systemPrompt = systemParts.join("\n\n");
  if (systemPrompt) {
    thread.context!.systemPrompt = systemPrompt;
  }
  if (tools.length) {
    thread.context!.tools = tools;
  }
  if (messages.length) {
    thread.context!.messages = messages;
  }
  return thread.context!.systemPrompt ||
    thread.context!.tools?.length ||
    thread.context!.messages?.length
    ? thread
    : undefined;
}

function _auroraRole(role: unknown): string | undefined {
  return typeof role === "string" ? role.toLowerCase() : undefined;
}

function _auroraText(content: Record<string, unknown> | undefined): string {
  return typeof content?.StringValue === "string" ? content.StringValue : "";
}

function _auroraToolCalls(raw: unknown): ToolCall[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: ToolCall[] = [];
  for (const value of raw) {
    const toolCall = _asRecord(value);
    const functionCall = _asRecord(toolCall?.FunctionCall);
    if (!toolCall || !functionCall) {
      continue;
    }
    const name = typeof functionCall.Name === "string" ? functionCall.Name : "";
    const { args, partial } = _parseAuroraArguments(functionCall.Arguments);
    result.push({
      id: typeof toolCall.ID === "string" && toolCall.ID ? toolCall.ID : uuid(),
      input: {
        name,
        arguments: args,
        ...(partial === undefined ? {} : { partialArguments: partial }),
      },
    });
  }
  return result;
}

function _parseAuroraArguments(raw: unknown): {
  args: Record<string, unknown>;
  partial?: string;
} {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    return { args: raw as Record<string, unknown> };
  }
  if (typeof raw !== "string" || !raw.trim()) {
    return { args: {} };
  }
  try {
    const parsed = parseJSON<unknown>(raw);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return { args: parsed as Record<string, unknown> };
    }
  } catch {
    // Keep malformed argument JSON visible as a partial input.
  }
  return { args: {}, partial: raw };
}

function _auroraTools(raw: unknown): Tool[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: Tool[] = [];
  for (const value of raw) {
    const tool = _asRecord(value);
    const name = typeof tool?.Name === "string" ? tool.Name : undefined;
    if (!tool || !name) {
      continue;
    }
    result.push({
      type: "function",
      name,
      description: typeof tool.Description === "string" ? tool.Description : "",
      parameters: _auroraParameters(tool.ToolParameters),
      ...(typeof tool.Strict === "boolean" ? { strict: tool.Strict } : {}),
    });
  }
  return result;
}

function _auroraParameters(raw: unknown): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const params = _asRecord(raw);
  if (!params) {
    return { type: "object", properties };
  }

  for (const [name, value] of Object.entries(params)) {
    const parameter = _asRecord(value);
    if (!parameter) {
      continue;
    }
    properties[name] = _auroraSchema(parameter);
    if (parameter.IsRequired === true) {
      required.push(name);
    }
  }
  return {
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
  };
}

function _auroraSchema(raw: Record<string, unknown>): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    type: _auroraJsonSchemaType(raw.Type),
  };
  _copyString(raw, schema, "Description", "description");
  _copyString(raw, schema, "Title", "title");
  _copyString(raw, schema, "Format", "format");
  if (Array.isArray(raw.Enum)) {
    schema.enum = raw.Enum;
  }
  if (raw.Default !== undefined) {
    schema.default = raw.Default;
  }
  if (raw.Minimum !== undefined) {
    schema.minimum =
      typeof raw.Minimum === "string" ? Number(raw.Minimum) : raw.Minimum;
  }

  if (schema.type === "array") {
    const items = _asRecord(_asRecord(raw.Items)?.item);
    schema.items = items ? _auroraSchema(items) : {};
  }
  if (schema.type === "object") {
    schema.properties = _auroraObjectProperties(raw.Items);
  }
  return schema;
}

function _auroraJsonSchemaType(type: unknown): string {
  switch (type) {
    case 1:
      return "string";
    case 2:
      return "number";
    case 3:
      return "boolean";
    case 4:
      return "object";
    case 5:
      return "array";
    default:
      return "string";
  }
}

function _auroraObjectProperties(raw: unknown): Record<string, unknown> {
  const items = _asRecord(raw);
  if (!items) {
    return {};
  }
  const properties: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(items)) {
    const field = _asRecord(value);
    if (field) {
      properties[name] = _auroraSchema(field);
    }
  }
  return properties;
}

function _copyString(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  from: string,
  to: string
): void {
  if (typeof source[from] === "string") {
    target[to] = source[from];
  }
}

function _asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
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
