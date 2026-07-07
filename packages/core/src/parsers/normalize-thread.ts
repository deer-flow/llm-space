import type {
  AssistantMessage,
  ImageDataContent,
  Message,
  ModelConfig,
  ModelProviderGroup,
  TextContent,
  Thread,
  ThreadContext,
  Tool,
  ToolCall,
  UserMessage,
  UserMessageContent,
} from "../types";
import {
  normalizeTool,
  type FunctionTool,
  type LegacyMcpToolSource,
} from "../types/tools";
import { parseJSON, uuid } from "../utils";

import type { ThreadParseContext } from "./thread-parser";

/**
 * Best-effort resolution of a message's `content` field. A single walk collects
 * every representable piece; each role then picks what it needs (a user message
 * takes text/images, an assistant message takes text + thinking + tool uses,
 * etc.).
 */
interface ResolvedContent {
  text: TextContent[];
  images: ImageDataContent[];
  thinking: string[];
  toolUses: RawToolUse[];
  toolResults: RawToolResult[];
}

interface RawToolUse {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface RawToolResult {
  toolUseId: string | undefined;
  content: TextContent[];
}

/**
 * Normalize a parsed JSON value from a foreign chat format (OpenAI
 * ChatCompletion / Anthropic Messages) into our internal {@link Thread}. Returns
 * `undefined` when nothing usable (no messages, system prompt, or tools) is
 * found. The `model` is intentionally left empty; `title` is passed through
 * only when present as a string.
 *
 * Shared across parsers so a future JSONL parser can reuse the same mapping.
 */
export function normalizeToThread(
  data: unknown,
  context?: ThreadParseContext
): Thread | undefined {
  const rawMessages = _extractMessages(data);
  if (!rawMessages) {
    return undefined;
  }
  const root = _asRecord(data);

  const systemParts: string[] = [];
  const topSystem = _resolveSystemField(root?.system);
  if (topSystem) {
    systemParts.push(topSystem);
  }

  const toolCallsById = new Map<string, ToolCall>();
  const messages: Message[] = [];

  for (const raw of rawMessages) {
    const m = _asRecord(raw);
    if (!m) {
      continue;
    }
    const role = typeof m.role === "string" ? m.role : undefined;

    switch (role) {
      case "system":
      case "developer": {
        const text = _joinText(_resolveContent(m.content).text);
        if (text) {
          systemParts.push(text);
        }
        break;
      }

      case "user": {
        const resolved = _resolveContent(m.content);
        // Anthropic carries tool results inside a `user` message; they belong
        // on the matching assistant tool call, not in the user content.
        for (const result of resolved.toolResults) {
          _attachToolResult(toolCallsById, result.toolUseId, result.content);
        }
        const content: UserMessageContent[] = [
          ...resolved.text,
          ...resolved.images,
        ];
        if (content.length) {
          const message: UserMessage = { id: _id(m), role: "user", content };
          messages.push(message);
        }
        break;
      }

      case "assistant": {
        const message = _resolveAssistant(m, toolCallsById);
        if (message) {
          messages.push(message);
        }
        break;
      }

      case "tool": {
        // OpenAI ChatCompletion tool-result message.
        const toolCallId =
          typeof m.tool_call_id === "string" ? m.tool_call_id : undefined;
        const content = _resolveContent(m.content).text;
        _attachToolResult(toolCallsById, toolCallId, content);
        break;
      }

      default:
        break;
    }
  }

  const tools = _resolveTools(root?.tools);
  const systemPrompt = systemParts.length
    ? systemParts.join("\n\n")
    : undefined;
  const model = _resolveModel(root?.model, context?.availableModels);

  if (!messages.length && !systemPrompt && !tools.length && !model) {
    return undefined;
  }

  const threadContext: ThreadContext = {};
  if (systemPrompt !== undefined) {
    threadContext.systemPrompt = systemPrompt;
  }
  if (tools.length) {
    threadContext.tools = tools;
  }
  if (messages.length) {
    threadContext.messages = messages;
  }

  const thread: Thread = { context: threadContext };
  const title = root && typeof root.title === "string" ? root.title : undefined;
  if (title !== undefined) {
    thread.title = title;
  }
  if (model) {
    thread.model = model;
  }
  return thread;
}

/**
 * Resolve a foreign dump's `model` field. Only a bare id string is resolvable:
 * it is matched (by model id) against the first configured model across the
 * given provider groups. Returns `undefined` when `model` isn't a string, no
 * models are provided, or nothing matches.
 */
function _resolveModel(
  model: unknown,
  availableModels: readonly ModelProviderGroup[] | undefined
): ModelConfig | undefined {
  if (typeof model !== "string" || !model || !availableModels) {
    return undefined;
  }
  for (const group of availableModels) {
    for (const candidate of group.models) {
      if (candidate.id === model) {
        return { provider: candidate.provider || group.id, id: candidate.id };
      }
    }
  }
  return undefined;
}

/**
 * Build an assistant message, registering its tool calls so later tool results
 * can attach. Returns `undefined` when the message resolves to fully empty
 * (no content, thinking, or tool calls).
 */
function _resolveAssistant(
  m: Record<string, unknown>,
  toolCallsById: Map<string, ToolCall>
): AssistantMessage | undefined {
  const resolved = _resolveContent(m.content);

  const toolCalls: ToolCall[] = [];
  for (const use of resolved.toolUses) {
    const toolCall: ToolCall = {
      id: use.id,
      input: { name: use.name, arguments: use.arguments },
    };
    toolCalls.push(toolCall);
    toolCallsById.set(toolCall.id, toolCall);
  }
  for (const toolCall of _resolveOpenAiToolCalls(m.tool_calls)) {
    toolCalls.push(toolCall);
    toolCallsById.set(toolCall.id, toolCall);
  }

  const thinkingParts = [...resolved.thinking];
  // OpenAI-compatible providers put reasoning in a top-level string field.
  const reasoning = _firstString(
    m.reasoning_content,
    m.reasoning,
    m.thinking
  );
  if (reasoning) {
    thinkingParts.push(reasoning);
  }
  const thinking = thinkingParts.join("\n");

  if (!resolved.text.length && !thinking && !toolCalls.length) {
    return undefined;
  }

  const message: AssistantMessage = {
    id: _id(m),
    role: "assistant",
    content: resolved.text,
  };
  if (thinking) {
    message.thinking = thinking;
  }
  if (toolCalls.length) {
    message.toolCalls = toolCalls;
  }
  return message;
}

/**
 * Walk a message `content` field into its representable parts. Accepts a plain
 * string, an array of blocks, or nothing.
 */
function _resolveContent(content: unknown): ResolvedContent {
  const result: ResolvedContent = {
    text: [],
    images: [],
    thinking: [],
    toolUses: [],
    toolResults: [],
  };

  if (content == null) {
    return result;
  }
  if (typeof content === "string") {
    const text = _textContent(content);
    if (text) {
      result.text.push(text);
    }
    return result;
  }
  if (!Array.isArray(content)) {
    return result;
  }

  for (const block of content) {
    if (typeof block === "string") {
      const text = _textContent(block);
      if (text) {
        result.text.push(text);
      }
      continue;
    }
    const b = _asRecord(block);
    if (!b) {
      continue;
    }
    const type = typeof b.type === "string" ? b.type : undefined;

    switch (type) {
      case "text":
      case "input_text":
      case "output_text": {
        const text = _textContent(b.text);
        if (text) {
          result.text.push(text);
        }
        break;
      }

      case "thinking": {
        if (typeof b.thinking === "string" && b.thinking.trim()) {
          result.thinking.push(b.thinking);
        }
        break;
      }

      case "redacted_thinking":
        // Opaque reasoning; nothing displayable to carry over.
        break;

      case "tool_use": {
        result.toolUses.push({
          id: typeof b.id === "string" && b.id ? b.id : uuid(),
          name: typeof b.name === "string" ? b.name : "",
          arguments: _asRecord(b.input) ?? {},
        });
        break;
      }

      case "tool_result": {
        result.toolResults.push({
          toolUseId:
            typeof b.tool_use_id === "string" ? b.tool_use_id : undefined,
          content: _resolveContent(b.content).text,
        });
        break;
      }

      case "image": {
        const image = _resolveAnthropicImage(b);
        if (image) {
          result.images.push(image);
        }
        break;
      }

      case "image_url": {
        const image = _resolveOpenAiImage(b);
        if (image) {
          result.images.push(image);
        }
        break;
      }

      case "image_data": {
        // Already our internal shape.
        if (typeof b.mimeType === "string" && typeof b.data === "string") {
          const image = _imageData(b.mimeType, b.data);
          if (image) {
            result.images.push(image);
          }
        }
        break;
      }

      default:
        break;
    }
  }

  return result;
}

/** OpenAI ChatCompletion `tool_calls` → internal {@link ToolCall}s. */
function _resolveOpenAiToolCalls(toolCalls: unknown): ToolCall[] {
  if (!Array.isArray(toolCalls)) {
    return [];
  }
  const result: ToolCall[] = [];
  for (const raw of toolCalls) {
    const tc = _asRecord(raw);
    if (!tc) {
      continue;
    }
    const fn = _asRecord(tc.function);
    const name =
      fn && typeof fn.name === "string"
        ? fn.name
        : typeof tc.name === "string"
          ? tc.name
          : "";
    const { args, partial } = _parseArguments(fn ? fn.arguments : tc.arguments);
    const input: ToolCall["input"] = { name, arguments: args };
    if (partial !== undefined) {
      input.partialArguments = partial;
    }
    result.push({
      id: typeof tc.id === "string" && tc.id ? tc.id : uuid(),
      input,
    });
  }
  return result;
}

/**
 * Parse a tool-call `arguments` value. OpenAI sends a JSON string; Anthropic
 * sends an object. On an unparseable string, fall back to `{}` and keep the raw
 * text in `partialArguments`.
 */
function _parseArguments(raw: unknown): {
  args: Record<string, unknown>;
  partial?: string;
} {
  if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    return { args: raw as Record<string, unknown> };
  }
  if (typeof raw === "string") {
    if (!raw.trim()) {
      return { args: {} };
    }
    try {
      const parsed = parseJSON<unknown>(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { args: parsed as Record<string, unknown> };
      }
    } catch {
      // fall through to the partial-arguments fallback
    }
    return { args: {}, partial: raw };
  }
  return { args: {} };
}

/** Anthropic top-level `system`: a string or an array of text blocks. */
function _resolveSystemField(system: unknown): string | undefined {
  if (typeof system === "string") {
    return system.trim() ? system : undefined;
  }
  if (Array.isArray(system)) {
    return _joinText(_resolveContent(system).text) || undefined;
  }
  return undefined;
}

/**
 * Normalize a tools array. Accepts Anthropic (`input_schema`), OpenAI
 * ChatCompletion (`{ type: "function", function: {...} }`), and already-internal
 * shapes.
 */
function _resolveTools(tools: unknown): Tool[] {
  if (!Array.isArray(tools)) {
    return [];
  }
  const result: Tool[] = [];
  for (const raw of tools) {
    const t = _asRecord(raw);
    if (!t) {
      continue;
    }
    const src = _asRecord(t.function) ?? t;
    const name = typeof src.name === "string" ? src.name : undefined;
    if (!name) {
      continue;
    }
    const description =
      typeof src.description === "string" ? src.description : "";
    const parameters =
      _asRecord(src.parameters) ?? _asRecord(src.input_schema) ?? {};
    const base: Omit<FunctionTool, "type"> = {
      name,
      description,
      parameters,
    };
    if (typeof src.strict === "boolean") {
      base.strict = src.strict;
    }
    if (src.type === "mcp") {
      const { serverId, serverName, toolName } = src;
      if (
        typeof serverId === "string" &&
        typeof serverName === "string" &&
        typeof toolName === "string"
      ) {
        result.push({
          ...base,
          type: "mcp",
          serverId,
          serverName,
          toolName,
        });
      }
      continue;
    }
    const source = _resolveToolSource(src.source);
    result.push(normalizeTool(source ? { ...base, source } : base));
  }
  return result;
}

function _resolveToolSource(source: unknown): LegacyMcpToolSource | undefined {
  const raw = _asRecord(source);
  if (raw?.type !== "mcp") {
    return undefined;
  }
  const { serverId, serverName, toolName } = raw;
  if (
    typeof serverId !== "string" ||
    typeof serverName !== "string" ||
    typeof toolName !== "string"
  ) {
    return undefined;
  }
  return { type: "mcp", serverId, serverName, toolName };
}

/** Anthropic image block: only base64 sources can be inlined. */
function _resolveAnthropicImage(
  b: Record<string, unknown>
): ImageDataContent | undefined {
  const source = _asRecord(b.source);
  if (!source) {
    return undefined;
  }
  if (
    source.type === "base64" &&
    typeof source.media_type === "string" &&
    typeof source.data === "string"
  ) {
    return _imageData(source.media_type, source.data);
  }
  return undefined;
}

/** OpenAI image block: only `data:` base64 URLs can be inlined. */
function _resolveOpenAiImage(
  b: Record<string, unknown>
): ImageDataContent | undefined {
  const imageUrl = _asRecord(b.image_url);
  const rawUrl = imageUrl?.url ?? b.image_url;
  const url = typeof rawUrl === "string" ? rawUrl : undefined;
  if (!url) {
    return undefined;
  }
  const match = /^data:(image\/\w+);base64,(.*)$/s.exec(url);
  if (match?.[1] === undefined || match[2] === undefined) {
    return undefined;
  }
  return _imageData(match[1], match[2]);
}

/** Build an {@link ImageDataContent}, enforcing the `image/<subtype>` shape. */
function _imageData(
  mimeType: string,
  data: string
): ImageDataContent | undefined {
  if (!/^image\/\w+$/.test(mimeType)) {
    return undefined;
  }
  return { type: "image_data", mimeType, data };
}

/** Set a tool call's output, matching by id. Unmatched results are dropped. */
function _attachToolResult(
  toolCallsById: Map<string, ToolCall>,
  toolCallId: string | undefined,
  content: TextContent[]
): void {
  if (!toolCallId) {
    return;
  }
  const toolCall = toolCallsById.get(toolCallId);
  if (!toolCall) {
    return;
  }
  toolCall.output = { content };
}

/** A {@link TextContent} from a value, or `undefined` for empty/non-string. */
function _textContent(value: unknown): TextContent | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  return { type: "text", text: value };
}

/** The array of messages to iterate, from either `{ messages }` or a bare array. */
function _extractMessages(data: unknown): unknown[] | undefined {
  if (Array.isArray(data)) {
    return data as unknown[];
  }
  const root = _asRecord(data);
  if (root && Array.isArray(root.messages)) {
    return root.messages as unknown[];
  }
  return undefined;
}

/** The message id if present and non-empty, else a fresh uuid. */
function _id(m: Record<string, unknown>): string {
  return typeof m.id === "string" && m.id.length > 0 ? m.id : uuid();
}

/** The first non-empty string among the given values. */
function _firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function _joinText(text: TextContent[]): string {
  return text.map((t) => t.text).join("\n");
}

function _asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
