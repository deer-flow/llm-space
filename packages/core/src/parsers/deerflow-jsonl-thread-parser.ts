import { ThreadZodSchema, type Thread } from "../types";

import { normalizeToThread } from "./normalize-thread";
import type {
  ThreadParseContext,
  ThreadParseDiagnostic,
  ThreadParser,
} from "./thread-parser";

const HUMAN_EVENT = "llm.human.input";
const ASSISTANT_EVENTS = new Set(["llm.ai.response", "ai_message"]);
const TOOL_EVENT = "llm.tool.result";

/** Parses DeerFlow persisted run-event `.jsonl` files. */
export class DeerFlowJsonlThreadParser implements ThreadParser {
  readonly extensions = [".jsonl"] as const;

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
  const messages: Record<string, unknown>[] = [];
  let validRows = 0;

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(line);
      validRows++;
    } catch {
      continue;
    }
    const message = _messageFromEvent(value);
    if (message) {
      messages.push(message);
    }
  }

  if (validRows === 0) {
    return {
      status: "invalid-json",
      message: "The file does not contain valid JSONL.",
    };
  }

  const thread = normalizeToThread({ messages }, context);
  if (!thread) {
    return {
      status: "invalid-shape",
      message: "The JSONL does not contain recognized DeerFlow messages.",
    };
  }

  const validated = ThreadZodSchema.safeParse(thread);
  if (!validated.success) {
    return {
      status: "invalid-shape",
      message: "The JSONL contains invalid DeerFlow messages.",
    };
  }

  return { status: "parsed", thread: validated.data, recovered: false };
}

function _messageFromEvent(
  value: unknown
): Record<string, unknown> | undefined {
  const event = _asRecord(value);
  const content = _asRecord(event?.content);
  if (!event || !content) {
    return undefined;
  }
  if (event.category !== undefined && event.category !== "message") {
    return undefined;
  }

  const role = _messageRole(event.event_type, content.type);
  if (!role || _isHidden(event, content, role)) {
    return undefined;
  }

  const message: Record<string, unknown> = { ...content, role };
  if (role === "assistant" && Array.isArray(content.tool_calls)) {
    message.tool_calls = content.tool_calls.map(_normalizeToolCall);
  }
  return message;
}

function _messageRole(
  eventType: unknown,
  contentType: unknown
): "user" | "assistant" | "tool" | undefined {
  if (eventType === HUMAN_EVENT) {
    return "user";
  }
  if (typeof eventType === "string" && ASSISTANT_EVENTS.has(eventType)) {
    return "assistant";
  }
  if (eventType === TOOL_EVENT) {
    return "tool";
  }
  if (eventType !== undefined) {
    return undefined;
  }
  if (contentType === "human") {
    return "user";
  }
  if (contentType === "ai") {
    return "assistant";
  }
  if (contentType === "tool") {
    return "tool";
  }
  return undefined;
}

function _isHidden(
  event: Record<string, unknown>,
  content: Record<string, unknown>,
  role: "user" | "assistant" | "tool"
): boolean {
  const caller = _asRecord(event.metadata)?.caller;
  if (typeof caller === "string") {
    if (caller.startsWith("middleware:")) {
      return true;
    }
    if (role === "assistant" && caller.startsWith("subagent:")) {
      return true;
    }
  }
  const additional = _asRecord(content.additional_kwargs);
  return content.name === "summary" || additional?.hide_from_ui === true;
}

function _normalizeToolCall(value: unknown): unknown {
  const toolCall = _asRecord(value);
  if (!toolCall || !("args" in toolCall) || "arguments" in toolCall) {
    return value;
  }
  const { args, ...rest } = toolCall;
  return { ...rest, arguments: args };
}

function _asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
