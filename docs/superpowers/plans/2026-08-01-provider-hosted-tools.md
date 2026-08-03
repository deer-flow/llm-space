# Provider-Hosted Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users configure provider-hosted tool objects, forward them unchanged to model services, and persist and display hosted-tool activity, sources, and citations without treating those tools as locally executable ReAct tools.

**Architecture:** The product and persisted domain use `ProviderHostedTool`, the `provider-hosted` discriminant, and `providerHostedToolActivities`; only the patched pi Responses boundary uses `responseApiNativeTools` and `nativeToolActivities`. The renderer partitions hosted definitions from client tools, the runtime appends them to the provider payload without a capability preflight, and the reducer maps provider output back into provider-neutral thread data. Legacy branch-era fields are normalized before validation, including nested run-history snapshots.

**Tech Stack:** TypeScript 6, Bun 1.3, TypeBox, Zod, Zustand, React 19, Electrobun, `@earendil-works/pi-ai` 0.83.0, `@earendil-works/pi-agent-core` 0.83.0, OpenAI-compatible Responses streaming.

---

## File map

- `packages/core/src/types/shared/json-value.ts` — recursive JSON-only schema used by opaque tool definitions and raw provider output.
- `packages/core/src/types/tools/index.ts` — canonical provider-hosted tool contract, identity, legacy normalization, and non-executable invariant.
- `packages/core/src/types/messages/provider-hosted-tool.ts` — provider-hosted activity, source, and raw Responses output types.
- `packages/core/src/types/messages/contents.ts` and `packages/core/src/types/messages/messages.ts` — text annotations and persisted assistant metadata.
- `packages/core/src/types/threads/thread.ts` and `packages/core/src/types/threads/thread-zod.ts` — current-thread and nested run-history migration before validation.
- `packages/core/src/client/converters.ts` and `packages/core/src/client/reducer.ts` — product-domain to pi-boundary mapping in both directions.
- `packages/core/src/server/agent/stream.ts` — raw provider payload injection while keeping hosted tools outside the client ReAct tool list.
- `packages/runtime/src/models/providers/deepseek.ts` — DeepSeek provider with `deepseek-v4-flash` routed through the Responses adapter.
- `patches/@earendil-works%2Fpi-ai@0.83.0.patch` — narrow dependency bridge for raw hosted definitions, terminal output replay, activities, and annotations.
- `packages/ui/src/components/thread-playground/tool/provider-hosted-tool-config.ts` and `packages/ui/src/components/thread-playground/tool/provider-hosted-tool-editor-dialog.tsx` — generic JSON parser and editor.
- `packages/ui/src/components/thread-playground/tool/tool-list-view.tsx` and `packages/ui/src/components/thread-playground/tool/tool-list-item.tsx` — add/edit/remove entry points and identity-safe chips.
- `packages/ui/src/components/thread-playground/message/provider-hosted-tool-activity-list.tsx`, `packages/ui/src/components/thread-playground/message/provider-hosted-tool-activity-utils.ts`, `packages/ui/src/components/thread-playground/message/citation-list.tsx`, `packages/ui/src/components/thread-playground/message/text-citation-utils.ts`, and `packages/ui/src/components/thread-playground/message/use-text-citation-extension.ts` — read-only hosted activity and citation presentation.
- `packages/core/src/generator/langgraph/index.ts` — explicit guard for an unsupported export target.
- `docs/superpowers/specs/2026-08-01-provider-hosted-tools-design.md` — design rationale, protocol boundary, ownership, compatibility, and non-goals.

### Task 1: Define the canonical domain and compatibility boundary

**Files:**
- Create: `packages/core/src/types/shared/json-value.ts`
- Create: `packages/core/src/types/shared/json-value.test.ts`
- Modify: `packages/core/src/types/shared/index.ts`
- Modify: `packages/core/src/types/tools/index.ts`
- Modify: `packages/core/src/types/tools/index.test.ts`
- Create: `packages/core/src/types/messages/provider-hosted-tool.ts`
- Modify: `packages/core/src/types/messages/index.ts`
- Modify: `packages/core/src/types/messages/contents.ts`
- Modify: `packages/core/src/types/messages/messages.ts`
- Modify: `packages/core/src/types/threads/thread.ts`
- Modify: `packages/core/src/types/threads/thread-zod.ts`
- Modify: `packages/core/src/types/threads/thread.test.ts`
- Modify: `packages/core/src/types/threads/thread-zod.test.ts`

- [ ] **Step 1: Write the failing schema and migration tests**

Add a canonical tool fixture with nested, provider-specific JSON and assert that it is accepted, preserved, uniquely keyed, and never executable:

In `packages/core/src/types/tools/index.test.ts`, add
`import { Compile } from "typebox/compile";`, and add `getToolKey` and `Tool` to
the existing value import from `./index` before inserting the fixture:

```ts
const tool = {
  type: "provider-hosted",
  config: {
    type: "web_search",
    search_context_size: "high",
    user_location: { type: "approximate", country: "CN" },
    external_web_access: false,
  },
} as const;

expect(Compile(Tool).Check(tool)).toBe(true);
expect(normalizeTool(tool)).toBe(tool);
expect(isExecutableTool(tool)).toBe(false);
expect(getToolKey(tool)).toBe("provider-hosted:web_search");
```

Add these compatibility tests to
`packages/core/src/types/threads/thread-zod.test.ts`:

```ts
test("normalizes legacy provider-hosted fields before validation", () => {
  const parsed = ThreadZodSchema.parse({
    context: {
      tools: [
        {
          type: "response-api-native",
          config: { type: "web_search", search_context_size: "high" },
        },
      ],
      messages: [
        {
          id: "assistant-legacy",
          role: "assistant",
          content: [],
          nativeToolActivities: [
            {
              type: "web_search_call",
              raw: { type: "web_search_call" },
            },
          ],
        },
      ],
    },
    runHistory: [
      {
        timestamp: 1,
        thread: {
          context: {
            messages: [
              {
                id: "assistant-run",
                role: "assistant",
                content: [],
                nativeToolActivities: [
                  {
                    type: "web_search_call",
                    raw: { type: "web_search_call" },
                  },
                ],
              },
            ],
          },
        },
      },
    ],
  });

  expect(parsed.context?.tools?.[0]?.type).toBe("provider-hosted");
  expect(parsed.context?.messages?.[0]).toHaveProperty(
    "providerHostedToolActivities"
  );
  expect(
    parsed.runHistory?.[0]?.thread.context?.messages?.[0]
  ).toHaveProperty("providerHostedToolActivities");
  expect(JSON.stringify(parsed)).not.toContain("nativeToolActivities");
});

test("keeps canonical activities when both field names exist", () => {
  const currentActivity = {
    type: "current_web_search_call",
    raw: { type: "current_web_search_call" },
  };
  const parsed = ThreadZodSchema.parse({
    context: {
      messages: [
        {
          id: "assistant-mixed",
          role: "assistant",
          content: [],
          providerHostedToolActivities: [currentActivity],
          nativeToolActivities: [
            {
              type: "legacy_web_search_call",
              raw: { type: "legacy_web_search_call" },
            },
          ],
        },
      ],
    },
  });

  expect(
    parsed.context?.messages?.[0]?.role === "assistant"
      ? parsed.context.messages[0].providerHostedToolActivities
      : undefined
  ).toEqual([currentActivity]);
  expect(JSON.stringify(parsed)).not.toContain("nativeToolActivities");
});
```

Add this runtime-normalizer regression to `thread.test.ts`:

Add `normalizeThread` to the existing value import from `./thread`; the file
already imports the `Thread` schema used by the cast below.

```ts
test("normalizes legacy tool and activity fields recursively", () => {
  const legacyMessage = {
    id: "assistant-legacy",
    role: "assistant" as const,
    content: [{ type: "text" as const, text: "Result" }],
    nativeToolActivities: [
      {
        id: "ws_1",
        type: "web_search_call",
        raw: { id: "ws_1", type: "web_search_call" },
      },
    ],
  };
  const legacyContext = {
    tools: [
      {
        type: "response-api-native" as const,
        config: { type: "web_search", search_context_size: "high" },
      },
    ],
    messages: [legacyMessage],
  };
  const normalized = normalizeThread({
    context: legacyContext,
    runHistory: [{ thread: { context: legacyContext }, timestamp: 1 }],
  } as unknown as Thread);

  expect(normalized.context?.tools?.[0]).toEqual({
    type: "provider-hosted",
    config: { type: "web_search", search_context_size: "high" },
  });
  expect(normalized.context?.messages?.[0]).toMatchObject({
    providerHostedToolActivities: legacyMessage.nativeToolActivities,
  });
  expect(
    normalized.runHistory?.[0]?.thread.context?.messages?.[0]
  ).toMatchObject({
    providerHostedToolActivities: legacyMessage.nativeToolActivities,
  });
  expect(JSON.stringify(normalized)).not.toContain("nativeToolActivities");
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
bun test packages/core/src/types/shared/json-value.test.ts packages/core/src/types/tools/index.test.ts packages/core/src/types/threads/thread.test.ts packages/core/src/types/threads/thread-zod.test.ts
```

Expected: non-zero exit because the canonical provider-hosted schemas and recursive compatibility normalization do not exist yet.

- [ ] **Step 3: Implement JSON-only tool and response schemas**

Create `packages/core/src/types/shared/json-value.ts` with this exact content so
the editor can accept arbitrary JSON fields without accepting `undefined`,
functions, symbols, or `bigint`:

```ts
import { Type, type Static } from "typebox";

const JSON_VALUE_REF = "#/$defs/JsonValue";

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const JSON_VALUE_DEFINITIONS = {
  JsonValue: Type.Union([
    Type.Null(),
    Type.Boolean(),
    Type.Number(),
    Type.String(),
    Type.Array(Type.Ref(JSON_VALUE_REF)),
    Type.Record(Type.String(), Type.Ref(JSON_VALUE_REF)),
  ]),
};

export const JsonValue = Type.Unsafe<JsonValue>({
  $defs: JSON_VALUE_DEFINITIONS,
  $ref: JSON_VALUE_REF,
});

export const JsonObject = Type.Record(Type.String(), JsonValue);
export type JsonObject = Static<typeof JsonObject>;
```

Export the new shared schema from `packages/core/src/types/shared/index.ts`:

```ts
export * from "./json-value";
```

In `packages/core/src/types/tools/index.ts`, extend the shared import and insert
the canonical tool envelope after `BuiltinToolCallResponse`:

```ts
import { JSONSchema, JsonValue } from "../shared";

export const ProviderHostedToolConfig = Type.Intersect([
  Type.Object({
    type: Type.String({
      minLength: 1,
      pattern: "^(?!(?:function|custom)$)\\S(?:.*\\S)?$",
    }),
  }),
  Type.Record(Type.String(), JsonValue),
]);
export type ProviderHostedToolConfig = Static<
  typeof ProviderHostedToolConfig
> &
  Record<string, JsonValue>;

export const ProviderHostedTool = Type.Object({
  type: Type.Literal("provider-hosted"),
  config: ProviderHostedToolConfig,
});
export type ProviderHostedTool = Omit<
  Static<typeof ProviderHostedTool>,
  "config"
> & {
  config: ProviderHostedToolConfig;
};

export interface LegacyResponseApiNativeTool {
  type: "response-api-native";
  config: ProviderHostedToolConfig;
}
```

Replace both the TypeBox and TypeScript `Tool` unions so the Step 1 fixtures
compile and validate against the public tool contract:

```ts
export const Tool = Type.Union([
  FunctionTool,
  McpTool,
  BuiltinTool,
  ProviderHostedTool,
]);
export type Tool =
  | FunctionTool
  | McpTool
  | BuiltinTool
  | ProviderHostedTool;
```

Create `packages/core/src/types/messages/provider-hosted-tool.ts` with this
exact content:

```ts
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
```

Export the message schema from `packages/core/src/types/messages/index.ts`:

```ts
export * from "./provider-hosted-tool";
```

Add the annotation schema and exact `TextContent` field in
`packages/core/src/types/messages/contents.ts`:

```ts
import { JsonObject } from "../shared";

export const TextAnnotation = Type.Object({
  type: Type.String(),
  url: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  startIndex: Type.Optional(Type.Number({ minimum: 0 })),
  endIndex: Type.Optional(Type.Number({ minimum: 0 })),
  raw: JsonObject,
});
export type TextAnnotation = Static<typeof TextAnnotation>;

annotations: Type.Optional(Type.Array(TextAnnotation)),
```

In `packages/core/src/types/messages/messages.ts`, import
`ProviderHostedToolActivity` and `ResponseOutputItem`, then add these exact
assistant fields after `toolCalls`:

```ts
providerHostedToolActivities: Type.Optional(
  Type.Array(ProviderHostedToolActivity)
),
responseOutputItems: Type.Optional(Type.Array(ResponseOutputItem)),
```

- [ ] **Step 4: Implement canonical identity and legacy read migration**

Keep legacy names only as accepted input and immediately normalize them:

```ts
export function normalizeTool(
  tool: Tool | LegacyTool | LegacyResponseApiNativeTool
): Tool {
  if (tool.type === "response-api-native") {
    return { type: "provider-hosted", config: tool.config };
  }
  if (tool.type === "provider-hosted") {
    return tool;
  }
  if (tool.type === "builtin") {
    if (tool.name === "ask_user_question" && tool.terminate !== true) {
      return { ...tool, terminate: true };
    }
    return tool;
  }
  if (tool.type === "mcp") {
    return tool;
  }
  const legacySource = _getLegacyMcpSource(tool);
  if (legacySource) {
    return {
      type: "mcp",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      ...(tool.strict === undefined ? {} : { strict: tool.strict }),
      serverId: legacySource.serverId,
      serverName: legacySource.serverName,
      toolName: legacySource.toolName,
    };
  }
  if (tool.type === "function" && !("source" in tool)) {
    return tool as FunctionTool;
  }
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    ...(tool.strict === undefined ? {} : { strict: tool.strict }),
  };
}

export function isProviderHostedTool(
  tool: Tool
): tool is ProviderHostedTool {
  return tool.type === "provider-hosted";
}

export function getToolKey(tool: Tool): string {
  return isProviderHostedTool(tool)
    ? `provider-hosted:${tool.config.type}`
    : tool.name;
}
```

In `packages/core/src/types/threads/thread.ts`, expand the message import before
adding the normalizers:

```diff
-import { Message, ModelUsage } from "../messages";
+import {
+  type AssistantMessage,
+  Message,
+  ModelUsage,
+  type ProviderHostedToolActivity,
+} from "../messages";
```

In `packages/core/src/types/threads/thread.ts`, use this path-aware
runtime normalization. It visits only thread contexts and run snapshots, so
opaque provider config, `raw`, and `action` JSON remain untouched:

```ts
export function normalizeThread(thread: Thread): Thread {
  const context = thread.context;
  const runHistory = thread.runHistory;
  let next = thread;

  if (context) {
    const normalizedContext = _normalizeThreadContext(context);
    if (normalizedContext !== context) {
      next = { ...next, context: normalizedContext };
    }
  }

  if (runHistory) {
    let changed = false;
    const normalizedRunHistory = runHistory.map((run) => {
      const normalizedThread = normalizeThread(run.thread);
      if (normalizedThread !== run.thread) {
        changed = true;
        return { ...run, thread: normalizedThread };
      }
      return run;
    });
    if (changed) {
      next = { ...next, runHistory: normalizedRunHistory };
    }
  }

  return next;
}

function _normalizeThreadContext(context: ThreadContext): ThreadContext {
  let next = context;
  const tools = context.tools;
  if (tools) {
    const normalizedTools = normalizeTools(tools);
    if (!tools.every((tool, index) => tool === normalizedTools[index])) {
      next = { ...next, tools: normalizedTools };
    }
  }

  const messages = context.messages;
  if (messages) {
    let changed = false;
    const normalizedMessages = messages.map((message) => {
      const normalizedMessage = _normalizeMessage(message);
      if (normalizedMessage !== message) changed = true;
      return normalizedMessage;
    });
    if (changed) {
      next = { ...next, messages: normalizedMessages };
    }
  }

  return next;
}

function _normalizeMessage(message: Message): Message {
  if (message.role !== "assistant" || !("nativeToolActivities" in message)) {
    return message;
  }
  const legacy = message as AssistantMessage & {
    nativeToolActivities?: ProviderHostedToolActivity[];
  };
  const { nativeToolActivities, ...rest } = legacy;
  if (
    rest.providerHostedToolActivities !== undefined ||
    nativeToolActivities === undefined
  ) {
    return rest;
  }
  return {
    ...rest,
    providerHostedToolActivities: nativeToolActivities,
  };
}
```

In `packages/core/src/types/threads/thread-zod.ts`, hoist nested recursive
`$defs` before converting the TypeBox schema to Zod. Insert this block after
`PersistedThreadJsonSchema`:

```ts
type JsonSchemaObject = Record<string, unknown>;

const ZodThreadJsonSchema = _hoistJsonSchemaDefinitions(
  ThreadJsonSchema as unknown as JsonSchemaObject
);
const ZodPersistedThreadJsonSchema = _hoistJsonSchemaDefinitions(
  PersistedThreadJsonSchema
);

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
    return value.map((item) =>
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
```

Then wrap both generated Zod schemas with
`_normalizeLegacyProviderHostedData` and insert the raw input normalizer:

```ts
export const ThreadZodSchema = z.preprocess(
  _normalizeLegacyProviderHostedData,
  z.fromJSONSchema(ZodThreadJsonSchema)
) as z.ZodType<Thread>;

export const PersistedThreadZodSchema = z.preprocess(
  _normalizeLegacyProviderHostedData,
  z.fromJSONSchema(ZodPersistedThreadJsonSchema)
) as z.ZodType<Thread & { blobs?: Record<string, string> }>;

function _normalizeLegacyProviderHostedData(value: unknown): unknown {
  if (!_isJsonSchemaObject(value)) return value;

  let next = value;
  const context = value.context;
  if (_isJsonSchemaObject(context)) {
    let nextContext = context;
    if (Array.isArray(context.tools)) {
      let changed = false;
      const tools = (context.tools as unknown[]).map((tool): unknown => {
        if (
          _isJsonSchemaObject(tool) &&
          tool.type === "response-api-native"
        ) {
          changed = true;
          return { ...tool, type: "provider-hosted" };
        }
        return tool;
      });
      if (changed) nextContext = { ...nextContext, tools };
    }
    if (Array.isArray(context.messages)) {
      let changed = false;
      const messages = (context.messages as unknown[]).map((message): unknown => {
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
          : { ...rest, providerHostedToolActivities: nativeToolActivities };
      });
      if (changed) nextContext = { ...nextContext, messages };
    }
    if (nextContext !== context) next = { ...next, context: nextContext };
  }

  if (Array.isArray(value.runHistory)) {
    let changed = false;
    const runHistory = (value.runHistory as unknown[]).map((run): unknown => {
      if (!_isJsonSchemaObject(run) || !("thread" in run)) return run;
      const thread = _normalizeLegacyProviderHostedData(run.thread);
      if (thread === run.thread) return run;
      changed = true;
      return { ...run, thread };
    });
    if (changed) next = { ...next, runHistory };
  }

  return next;
}
```

- [ ] **Step 5: Verify the domain and migration boundary**

Run:

```bash
bun test packages/core/src/types/shared/json-value.test.ts packages/core/src/types/tools/index.test.ts packages/core/src/types/threads/thread.test.ts packages/core/src/types/threads/thread-zod.test.ts
```

Expected: exit 0; nested JSON round-trips, invalid non-JSON values fail validation, current data remains canonical, and legacy keys survive only in migration fixtures.

- [ ] **Step 6: Commit the domain contract**

```bash
git add packages/core/src/types/shared packages/core/src/types/tools packages/core/src/types/messages packages/core/src/types/threads
git commit -m "feat: add provider-hosted tool domain contract"
```

### Task 2: Keep hosted execution outside the client ReAct loop

**Files:**
- Modify: `packages/core/src/types/agent.ts`
- Modify: `packages/core/src/client/converters.ts`
- Modify: `packages/core/src/client/converters.test.ts`
- Modify: `packages/core/src/client/reducer.ts`
- Create: `packages/core/src/client/reducer.test.ts`
- Modify: `packages/core/src/server/agent/stream.ts`
- Create: `packages/core/src/server/agent/stream.test.ts`
- Create: `packages/core/src/server/agent/pi-ai-native-tools.test.ts`
- Modify: `packages/runtime/src/streaming/stream-thread.ts`
- Create: `packages/runtime/src/models/providers/deepseek.ts`
- Create: `packages/runtime/src/models/providers/deepseek.test.ts`
- Modify: `packages/runtime/src/models/providers/builtin-providers.ts`
- Modify: `package.json`
- Modify: `bun.lock`
- Create: `patches/@earendil-works%2Fpi-ai@0.83.0.patch`

- [ ] **Step 1: Add the converter separation RED test**

In `packages/core/src/client/converters.test.ts`, insert this test inside
the existing `describe("convertToPiContext", ...)` block:

```ts
test("separates provider-hosted configs from client tools", () => {
  const result = convertToPiContext({
    messages: [],
    tools: [
      {
        type: "function",
        name: "lookup",
        description: "Lookup",
        parameters: { type: "object" },
      },
      {
        type: "provider-hosted",
        config: {
          type: "web_search",
          search_context_size: "high",
          user_location: { type: "approximate", country: "CN" },
        },
      },
    ],
  });

  expect(result.tools.map((tool) => tool.name)).toEqual(["lookup"]);
  expect(result.responseApiNativeTools).toEqual([
    {
      type: "web_search",
      search_context_size: "high",
      user_location: { type: "approximate", country: "CN" },
    },
  ]);
});
```

Run:

```bash
bun test packages/core/src/client/converters.test.ts -t "separates provider-hosted configs from client tools"
```

Expected: FAIL because `convertToPiContext()` still sends every tool through
the client-tool converter and does not expose `responseApiNativeTools`.

- [ ] **Step 2: Add the converter replay RED test**

Insert this second test in the same describe block:

```ts
test("preserves response replay metadata on assistant messages", () => {
  const result = convertToPiContext({
    messages: [
      {
        id: "assistant-1",
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Result",
            annotations: [
              {
                type: "url_citation",
                url: "https://example.com",
                startIndex: 0,
                endIndex: 6,
                raw: { type: "url_citation", url: "https://example.com" },
              },
            ],
          },
        ],
        providerHostedToolActivities: [
          {
            id: "ws_1",
            type: "web_search_call",
            raw: { id: "ws_1", type: "web_search_call" },
          },
        ],
        responseOutputItems: [{ id: "ws_1", type: "web_search_call" }],
      },
    ],
  });

  const assistant = result.messages[0];
  expect(assistant?.role).toBe("assistant");
  if (assistant?.role !== "assistant") throw new Error("Expected assistant");
  expect(assistant.content[0]).toMatchObject({
    type: "text",
    annotations: [{ url: "https://example.com" }],
  });
  expect(assistant.nativeToolActivities).toHaveLength(1);
  expect(assistant.responseOutputItems).toEqual([
    { id: "ws_1", type: "web_search_call" },
  ]);
});
```

Run:

```bash
bun test packages/core/src/client/converters.test.ts -t "preserves response replay metadata on assistant messages"
```

Expected: FAIL because the app-domain activity, annotations, and terminal
output are not mapped back to the pi assistant message.

- [ ] **Step 3: Create the reducer RED test**

Create `packages/core/src/client/reducer.test.ts` with this exact content:

```ts
import { describe, expect, test } from "bun:test";

import type { AgentEvent } from "@earendil-works/pi-agent-core";

import { reduceMessages } from "./reducer";

describe("reduceMessages final Responses metadata", () => {
  test("message_end maps provider activity, annotations, and response output", () => {
    const responseOutput = [{ id: "ws_1", type: "web_search_call" }];
    const event = {
      type: "message_end",
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Result",
            annotations: [
              {
                type: "url_citation",
                url: "https://example.com",
                startIndex: 0,
                endIndex: 6,
                raw: { type: "url_citation", url: "https://example.com" },
              },
            ],
          },
        ],
        nativeToolActivities: [
          {
            id: "ws_1",
            type: "web_search_call",
            raw: responseOutput[0],
          },
        ],
        responseOutputItems: responseOutput,
        api: "openai-responses",
        provider: "openai",
        model: "gpt-test",
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 2,
          cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            total: 0,
          },
        },
        stopReason: "stop",
        timestamp: Date.now(),
      },
    } as AgentEvent;

    const reduced = reduceMessages(event, {
      streamingMessage: { id: "assistant-1", role: "assistant", content: [] },
    });

    expect(reduced?.message.providerHostedToolActivities).toHaveLength(1);
    expect(reduced?.message.content[0]?.annotations?.[0]?.url).toBe(
      "https://example.com"
    );
    expect(reduced?.message.responseOutputItems).toEqual(responseOutput);
    expect(reduced?.message.toolCalls).toBeUndefined();
  });
});
```

Run:

```bash
bun test packages/core/src/client/reducer.test.ts
```

Expected: FAIL because `message_end` does not yet copy the pi Responses
metadata into the persisted assistant message.

- [ ] **Step 4: Add the runtime payload RED test**

In `packages/core/src/server/agent/stream.test.ts`, use the file's existing
`_completedStream()` helper and insert this test inside the existing
`describe("streamAgent Responses native tool forwarding", ...)` block:

```ts
test("forwards native tools without gating on the model API", async () => {
  let streamCalls = 0;
  let receivedPayload: Record<string, unknown> | undefined;
  const model: Model<"openai-completions"> = {
    id: "completion-only",
    name: "Completion only",
    api: "openai-completions",
    provider: "openai",
    baseUrl: "https://example.invalid/v1",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16_384,
  };
  const models = {
    getModel: () => model as Model<Api>,
    streamSimple: (
      _model: Model<Api>,
      _context: Context,
      options?: SimpleStreamOptions
    ) => {
      streamCalls += 1;
      return _completedStream(model, async () => {
        const payload = {
          tools: [{ type: "function", name: "lookup" }],
        };
        receivedPayload = ((await options?.onPayload?.(payload, model)) ??
          payload) as Record<string, unknown>;
      });
    },
  } as unknown as Models;
  const request: AgentStreamRequest = {
    model: { provider: "openai", id: model.id },
    context: {
      messages: [
        { role: "user", content: "Hello", timestamp: Date.now() },
      ],
      tools: [],
      responseApiNativeTools: [{ type: "web_search" }],
    },
  };

  let eventCount = 0;
  for await (const event of streamAgent(request, {
    models,
    signal: new AbortController().signal,
  })) {
    void event;
    eventCount += 1;
  }
  expect(eventCount).toBeGreaterThan(0);
  expect(streamCalls).toBe(1);
  expect(receivedPayload?.tools).toEqual([
    { type: "function", name: "lookup" },
    { type: "web_search" },
  ]);
});
```

Run:

```bash
bun test packages/core/src/server/agent/stream.test.ts -t "forwards native tools without gating on the model API"
```

Expected: FAIL because the runtime does not yet append the opaque object to
the fully built provider payload.

- [ ] **Step 5: Create the direct pi Responses contract fixture**

Create `packages/core/src/server/agent/pi-ai-native-tools.test.ts` with the
imports, models, output fixture, cleanup, SSE builder, and request reader below:

```ts
import { afterEach, describe, expect, test } from "bun:test";

import type {
  AssistantMessage,
  Context,
  Model,
  ToolResultMessage,
} from "@earendil-works/pi-ai";
import { streamSimple as streamCodexResponses } from "@earendil-works/pi-ai/api/openai-codex-responses";
import { streamSimple } from "@earendil-works/pi-ai/api/openai-responses";

const ORIGINAL_FETCH = globalThis.fetch;

const MODEL: Model<"openai-responses"> = {
  id: "gpt-native-test",
  name: "GPT native test",
  api: "openai-responses",
  provider: "openai",
  baseUrl: "https://example.invalid/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 16_384,
};

const CODEX_MODEL: Model<"openai-codex-responses"> = {
  ...MODEL,
  id: "gpt-codex-native-test",
  name: "GPT Codex native test",
  api: "openai-codex-responses",
  provider: "openai-codex",
  baseUrl: "https://example.invalid/backend-api",
};

const FUNCTION_TOOL = {
  name: "lookup",
  description: "Look up a topic",
  parameters: {
    type: "object",
    properties: { topic: { type: "string" } },
    required: ["topic"],
  },
};

const RESPONSE_OUTPUT = [
  {
    id: "ws_1",
    type: "web_search_call",
    status: "completed",
    action: { type: "search", query: "LLM Space" },
  },
  {
    id: "fc_1",
    type: "function_call",
    status: "completed",
    call_id: "call_1",
    name: "lookup",
    arguments: '{"topic":"LLM Space"}',
  },
  {
    id: "msg_1",
    type: "message",
    role: "assistant",
    status: "completed",
    content: [
      {
        type: "output_text",
        text: "LLM Space is a workbench.",
        annotations: [
          {
            type: "url_citation",
            url: "https://example.com/llm-space",
            title: "LLM Space",
            start_index: 0,
            end_index: 9,
          },
        ],
      },
    ],
  },
] as const;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

function _sseResponse(output = RESPONSE_OUTPUT): Response {
  const response = {
    id: "resp_1",
    object: "response",
    created_at: 1,
    model: MODEL.id,
    status: "completed",
    output,
    usage: {
      input_tokens: 10,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 5,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 15,
    },
  };
  const events = [
    { type: "response.created", response: { ...response, output: [] } },
    ...output.flatMap((item, outputIndex) => [
      { type: "response.output_item.added", output_index: outputIndex, item },
      { type: "response.output_item.done", output_index: outputIndex, item },
    ]),
    { type: "response.completed", response },
  ];
  const body = `${events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("")}data: [DONE]\n\n`;
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function _codexSseResponseWithSparseTerminalOutput(): Response {
  const terminalResponse = {
    id: "resp_codex_1",
    object: "response",
    created_at: 1,
    model: CODEX_MODEL.id,
    status: "completed",
    output: [RESPONSE_OUTPUT[2]],
    usage: {
      input_tokens: 10,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 5,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 15,
    },
  };
  const events = [
    {
      type: "response.created",
      response: { ...terminalResponse, status: "in_progress" },
    },
    ...RESPONSE_OUTPUT.flatMap((item, outputIndex) => [
      { type: "response.output_item.added", output_index: outputIndex, item },
      { type: "response.output_item.done", output_index: outputIndex, item },
    ]),
    { type: "response.done", response: terminalResponse },
  ];
  const body = `${events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("")}data: [DONE]\n\n`;
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

async function _requestBody(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Record<string, unknown>> {
  if (input instanceof Request) {
    return (await input.clone().json()) as Record<string, unknown>;
  }
  if (typeof init?.body !== "string") {
    throw new Error("Expected a JSON request body");
  }
  return JSON.parse(init.body) as Record<string, unknown>;
}
```

This fixture-only action does not run a test; the next two steps add one
independent contract at a time.

- [ ] **Step 6: Add the raw request, output, and replay RED test**

Append this exact block to the new test file:

```ts
describe("pi-ai Responses native tools bridge", () => {
  test("sends raw native tools and replays terminal output exactly once", async () => {
    const requestBodies: Record<string, unknown>[] = [];
    globalThis.fetch = (async (input, init) => {
      requestBodies.push(await _requestBody(input, init));
      return _sseResponse();
    }) as typeof fetch;

    const firstContext: Context = {
      messages: [
        { role: "user", content: "Find LLM Space", timestamp: Date.now() },
      ],
      tools: [FUNCTION_TOOL],
    };
    const first = await streamSimple(MODEL, firstContext, {
      apiKey: "test-key",
      responseApiNativeTools: [
        { type: "web_search", search_context_size: "high" },
      ],
    }).result();

    expect(requestBodies[0]?.tools).toEqual([
      {
        type: "function",
        name: "lookup",
        description: "Look up a topic",
        parameters: FUNCTION_TOOL.parameters,
      },
      { type: "web_search", search_context_size: "high" },
    ]);

    const nativeFirst = first as AssistantMessage & {
      nativeToolActivities?: Record<string, unknown>[];
      responseOutputItems?: Record<string, unknown>[];
    };
    expect(nativeFirst.nativeToolActivities?.[0]?.raw).toEqual(
      RESPONSE_OUTPUT[0]
    );
    expect(
      nativeFirst.content.find((block) => block.type === "text")?.annotations
    ).toEqual([
      {
        type: "url_citation",
        url: "https://example.com/llm-space",
        title: "LLM Space",
        startIndex: 0,
        endIndex: 9,
        raw: RESPONSE_OUTPUT[2].content[0].annotations[0],
      },
    ]);
    expect(nativeFirst.responseOutputItems).toEqual(
      RESPONSE_OUTPUT as unknown as Record<string, unknown>[]
    );

    const toolResult: ToolResultMessage = {
      role: "toolResult",
      toolCallId: "call_1|fc_1",
      toolName: "lookup",
      content: [{ type: "text", text: "lookup result" }],
      isError: false,
      timestamp: Date.now(),
    };
    await streamSimple(
      MODEL,
      {
        messages: [...firstContext.messages, nativeFirst, toolResult],
        tools: [FUNCTION_TOOL],
      },
      { apiKey: "test-key" }
    ).result();

    const secondInput = requestBodies[1]?.input;
    expect(secondInput).toEqual([
      {
        role: "user",
        content: [{ type: "input_text", text: "Find LLM Space" }],
      },
      ...RESPONSE_OUTPUT,
      {
        type: "function_call_output",
        call_id: "call_1",
        output: "lookup result",
      },
    ]);
    for (const type of [
      "web_search_call",
      "function_call",
      "message",
      "function_call_output",
    ]) {
      expect(
        (secondInput as { type?: string }[]).filter(
          (item) => item.type === type
        )
      ).toHaveLength(1);
    }
  });
});
```

Run:

```bash
bun test packages/core/src/server/agent/pi-ai-native-tools.test.ts -t "sends raw native tools and replays terminal output exactly once"
```

Expected: FAIL at typecheck or runtime because pi-ai 0.83.0 lacks the raw
option and discards hosted output items and annotations.

- [ ] **Step 7: Add the sparse Codex terminal-output RED test**

Insert this test before the closing brace of the existing
`describe("pi-ai Responses native tools bridge", ...)` block:

```ts
test("preserves Codex native output items when the terminal event is sparse", async () => {
  globalThis.fetch = (() =>
    Promise.resolve(
      _codexSseResponseWithSparseTerminalOutput()
    )) as unknown as typeof fetch;
  const jwtPayload = btoa(
    JSON.stringify({
      "https://api.openai.com/auth": {
        chatgpt_account_id: "account-test",
      },
    })
  );

  const result = await streamCodexResponses(
    CODEX_MODEL,
    {
      messages: [
        { role: "user", content: "Find LLM Space", timestamp: Date.now() },
      ],
      tools: [],
    },
    {
      apiKey: `header.${jwtPayload}.signature`,
      transport: "sse",
    }
  ).result();

  expect(result.responseOutputItems).toEqual([...RESPONSE_OUTPUT]);
  expect(result.nativeToolActivities?.[0]?.raw).toEqual(RESPONSE_OUTPUT[0]);
});
```

Run:

```bash
bun test packages/core/src/server/agent/pi-ai-native-tools.test.ts -t "preserves Codex native output items when the terminal event is sparse"
```

Expected: FAIL because the terminal response contains only the final message
and pi-ai does not merge it with the indexed streamed output items.

- [ ] **Step 8: Add the DeepSeek routing RED test**

Create `packages/runtime/src/models/providers/deepseek.test.ts` with this exact
content:

```ts
import { describe, expect, test } from "bun:test";

import { deepseekProvider } from "./deepseek";

describe("DeepSeek mixed API provider", () => {
  test("routes V4 Flash through Responses and keeps V4 Pro on Completions", () => {
    const models = deepseekProvider().getModels();
    const flash = models.find((model) => model.id === "deepseek-v4-flash");
    const pro = models.find((model) => model.id === "deepseek-v4-pro");

    expect(flash?.api).toBe("openai-responses");
    expect(pro?.api).toBe("openai-completions");
    expect(
      models.filter((model) => model.id === "deepseek-v4-flash")
    ).toHaveLength(1);
    expect(flash).toMatchObject({
      input: ["text"],
      contextWindow: 1_000_000,
      maxTokens: 384_000,
      cost: {
        input: 0.14,
        output: 0.28,
        cacheRead: 0.0028,
        cacheWrite: 0,
      },
      compat: {
        supportsDeveloperRole: false,
        supportsLongCacheRetention: false,
        sessionAffinityFormat: "openai-nosession",
      },
    });
  });
});
```

Run:

```bash
bun test packages/runtime/src/models/providers/deepseek.test.ts
```

Expected: FAIL because the local mixed-API provider does not exist and the
upstream model metadata does not select Responses for V4 Flash.

- [ ] **Step 9: Add the pi-only wire field**

Make the boundary explicit:

```ts
export interface PiThreadContext {
  systemPrompt?: string;
  messages: pi.Message[];
  tools: pi.Tool[];
  responseApiNativeTools: ProviderHostedToolConfig[];
}
```

Update the model connection request in
`packages/runtime/src/streaming/stream-thread.ts` at the same time so the new
required wire field is present:

```ts
context: {
  systemPrompt: "You are a connection tester.",
  messages: [
    {
      role: "user",
      content: [{ type: "text", text: 'Reply with "ok".' }],
      timestamp: Date.now(),
    },
  ],
  tools: [],
  responseApiNativeTools: [],
},
```

- [ ] **Step 10: Partition tools in the converter**

Partition once in `convertToPiContext()`:

```ts
const providerHostedTools = tools.filter(isProviderHostedTool);
return {
  systemPrompt: context.systemPrompt,
  messages: context.messages ? _convertToPiMessages(context.messages) : [],
  tools: _convertToPiTools(tools.filter(
    (tool): tool is Exclude<Tool, ProviderHostedTool> =>
      !isProviderHostedTool(tool)
  )),
  responseApiNativeTools: providerHostedTools.map((tool) => ({
    ...tool.config,
  })),
};
```

When constructing a pi assistant message, add these exact replay fields:

```ts
...(message.providerHostedToolActivities
  ? { nativeToolActivities: message.providerHostedToolActivities }
  : {}),
...(message.responseOutputItems
  ? { responseOutputItems: message.responseOutputItems }
  : {}),
```

- [ ] **Step 11: Map final pi output into the app message**

In the reducer's `message_end` branch, add these exact fields to
`messageWithProviderOutput`:

```ts
...(providerMessage?.nativeToolActivities
  ? {
      providerHostedToolActivities:
        providerMessage.nativeToolActivities,
    }
  : {}),
...(providerMessage?.responseOutputItems
  ? { responseOutputItems: providerMessage.responseOutputItems }
  : {}),
```

Build final text blocks from `providerMessage.content` so annotations delivered
on `output_item.done` replace the streaming text blocks. If the completed
message has no text, retain `{ type: "text", text: "" }` so activity-only
responses remain valid persisted assistant messages.

- [ ] **Step 12: Inject opaque definitions into the provider payload**

Chain the runtime's `onPayload` hook and append, rather than replace, existing tools:

```ts
function _appendResponseApiNativeTools(
  payload: unknown,
  nativeTools: readonly Record<string, unknown>[],
  model: Model<Api>
): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  const body = payload as Record<string, unknown>;
  if (model.api === "google-generative-ai" || model.api === "google-vertex") {
    const config = _objectField(body.config);
    return { ...body, config: _appendTools(config, nativeTools) };
  }
  if (model.api === "bedrock-converse-stream") {
    const toolConfig = _objectField(body.toolConfig);
    return { ...body, toolConfig: _appendTools(toolConfig, nativeTools) };
  }
  if (model.api === "pi-messages") {
    const context = _objectField(body.context);
    return { ...body, context: _appendTools(context, nativeTools) };
  }
  return _appendTools(body, nativeTools);
}

function _objectField(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function _appendTools(
  container: Record<string, unknown>,
  nativeTools: readonly Record<string, unknown>[]
): Record<string, unknown> {
  const tools: unknown[] = Array.isArray(container.tools)
    ? (container.tools as unknown[])
    : [];
  return { ...container, tools: [...tools, ...nativeTools] };
}
```

Chain this helper from `mergedOptions.onPayload` after any prior payload hook. Do not add a
provider/model support matrix or remove definitions based on `model.api`. The
model service remains authoritative and may reject unsupported tools or fields.

Insert this hook hunk in the injected `streamFn`; it preserves a
prior hook's replacement payload and applies structured response formatting
after hosted-tool injection:

```ts
if (responseApiNativeTools.length > 0 || hasResponseFormat) {
  const priorOnPayload = mergedOptions.onPayload;
  mergedOptions.onPayload = async (payload, payloadModel) => {
    const replaced = priorOnPayload
      ? await priorOnPayload(payload, payloadModel)
      : undefined;
    let nextPayload = replaced ?? payload;
    if (responseApiNativeTools.length > 0) {
      nextPayload = _appendResponseApiNativeTools(
        nextPayload,
        responseApiNativeTools,
        payloadModel
      );
    }
    return hasResponseFormat
      ? applyResponseFormat(nextPayload, payloadModel, responseType)
      : nextPayload;
  };
}
return models.streamSimple(streamModel, streamContext, mergedOptions);
```

- [ ] **Step 13: Prepare the exact pi-ai 0.83.0 patch target**

Keep the catalog at `^0.83.0`, then prepare the installed dependency:

```bash
bun patch @earendil-works/pi-ai@0.83.0
```

Expected: Bun prints the editable package directory for
`@earendil-works/pi-ai@0.83.0`. The next four steps modify only these files in
that prepared package:

```text
dist/types.d.ts
dist/api/openai-responses.d.ts
dist/api/openai-responses.js
dist/api/openai-responses-shared.js
```

- [ ] **Step 14: Extend `dist/types.d.ts`**

Add the raw option to `SimpleStreamOptions`:

```ts
/** Raw provider-hosted tool definitions forwarded only by Responses adapters. */
responseApiNativeTools?: readonly Record<string, unknown>[];
```

Replace the `TextContent` declaration and add the response metadata types with
this exact block:

```ts
export interface TextContent {
    type: "text";
    text: string;
    textSignature?: string;
    annotations?: TextAnnotation[];
}
export interface TextAnnotation {
    type: string;
    url?: string;
    title?: string;
    startIndex?: number;
    endIndex?: number;
    raw: Record<string, any>;
}
export interface NativeToolSource {
    url: string;
    title?: string;
}
export interface NativeToolActivity {
    id?: string;
    type: string;
    status?: string;
    action?: Record<string, any>;
    result?: any;
    sources?: NativeToolSource[];
    raw: Record<string, any>;
}
export type ResponseOutputItem = Record<string, any>;
```

Add these fields to `AssistantMessage` immediately before `timestamp`:

```ts
nativeToolActivities?: NativeToolActivity[];
responseOutputItems?: ResponseOutputItem[];
```

- [ ] **Step 15: Extend `dist/api/openai-responses.d.ts`**

Add this field to `OpenAIResponsesOptions` after `toolChoice`:

```ts
responseApiNativeTools?: readonly Record<string, unknown>[];
```

- [ ] **Step 16: Forward and serialize the option in `dist/api/openai-responses.js`**

In `streamSimple`, insert this block after `reasoningEffort` is computed and
before calling `stream()`:

```js
if (options?.responseApiNativeTools?.length) {
    base.responseApiNativeTools = options.responseApiNativeTools;
}
```

In `buildParams`, replace the existing `toolPlacement.immediate` conditional
with this exact block so client and provider-hosted tools share `params.tools`
without dropping deferred client tools:

```js
const immediateTools = convertResponsesTools(toolPlacement.immediate, {
    supportsStrictMode: compat.supportsStrictMode,
    supportsOpenAIGrammarTools: compat.supportsOpenAIGrammarTools,
});
const nativeTools = options?.responseApiNativeTools ?? [];
if (immediateTools.length > 0 || nativeTools.length > 0) {
    params.tools = [...immediateTools, ...nativeTools];
}
```

- [ ] **Step 17: Preserve replay and normalize output in `dist/api/openai-responses-shared.js`**

In `convertResponsesMessages()`, immediately after `const assistantMsg = msg;`
insert:

```js
if (Array.isArray(assistantMsg.responseOutputItems)) {
    messages.push(...structuredClone(assistantMsg.responseOutputItems));
    msgIndex++;
    continue;
}
```

At the start of `processResponsesStream()`, immediately after
`const outputSlots = new Map();`, add:

```js
const streamedOutputItems = new Map();
```

Immediately before `const finalizeResponse = (response) => {`, add these exact
normalizers:

```js
const normalizeSources = (item) => {
    const candidates = Array.isArray(item?.sources)
        ? item.sources
        : Array.isArray(item?.action?.sources)
            ? item.action.sources
            : [];
    return candidates.flatMap((source) => typeof source?.url === "string"
        ? [{ url: source.url, ...(typeof source.title === "string" ? { title: source.title } : {}) }]
        : []);
};
const normalizeNativeActivity = (item) => {
    const sources = normalizeSources(item);
    return {
        ...(typeof item.id === "string" ? { id: item.id } : {}),
        type: typeof item.type === "string" ? item.type : "unknown",
        ...(typeof item.status === "string" ? { status: item.status } : {}),
        ...(item.action && typeof item.action === "object" && !Array.isArray(item.action)
            ? { action: structuredClone(item.action) }
            : {}),
        ...(item.result !== undefined ? { result: structuredClone(item.result) } : {}),
        ...(sources.length > 0 ? { sources } : {}),
        raw: structuredClone(item),
    };
};
const normalizeAnnotations = (annotations) => (annotations ?? []).flatMap((annotation) => {
    if (!annotation || typeof annotation !== "object")
        return [];
    return [{
            type: typeof annotation.type === "string" ? annotation.type : "unknown",
            ...(typeof annotation.url === "string" ? { url: annotation.url } : {}),
            ...(typeof annotation.title === "string" ? { title: annotation.title } : {}),
            ...(typeof annotation.start_index === "number" ? { startIndex: annotation.start_index } : {}),
            ...(typeof annotation.end_index === "number" ? { endIndex: annotation.end_index } : {}),
            raw: structuredClone(annotation),
        }];
});
```

Replace the first two statements of `finalizeResponse()` with this exact merge
and normalization block:

```js
sawTerminalResponseEvent = true;
const responseOutputByIndex = new Map(streamedOutputItems);
const streamedIndexById = new Map([...streamedOutputItems.entries()].flatMap(([outputIndex, item]) => typeof item?.id === "string" ? [[item.id, outputIndex]] : []));
let nextOutputIndex = responseOutputByIndex.size === 0
    ? 0
    : Math.max(...responseOutputByIndex.keys()) + 1;
for (const [terminalIndex, item] of (response.output ?? []).entries()) {
    const streamedIndex = typeof item?.id === "string" ? streamedIndexById.get(item.id) : undefined;
    const outputIndex = streamedIndex ??
        (responseOutputByIndex.has(terminalIndex) ? nextOutputIndex++ : terminalIndex);
    responseOutputByIndex.set(outputIndex, structuredClone(item));
}
const responseOutput = [...responseOutputByIndex.entries()]
    .sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex)
    .map(([, item]) => item);
backfillReasoningSignatures(responseOutput);
output.responseOutputItems = responseOutput;
const nativeToolActivities = responseOutput
    .filter((item) => !["reasoning", "message", "function_call", "custom_tool_call"].includes(item.type))
    .map(normalizeNativeActivity);
if (nativeToolActivities.length > 0) {
    output.nativeToolActivities = nativeToolActivities;
}
```

In the `response.output_item.added` branch, add this statement before
`createSlot(...)`:

```js
streamedOutputItems.set(event.output_index, structuredClone(event.item));
```

In the `response.output_item.done` branch, add this statement immediately after
`const item = event.item;`:

```js
streamedOutputItems.set(event.output_index, structuredClone(item));
```

In the completed message-item branch, set annotations after setting text and
before setting `textSignature`:

```js
slot.block.annotations = item.content
    ?.filter((content) => content.type === "output_text")
    .flatMap((content) => normalizeAnnotations(content.annotations));
```

- [ ] **Step 18: Commit and register the exact Bun patch**

Run against the prepared package path printed by Step 13:

```bash
bun patch --commit node_modules/@earendil-works/pi-ai
```

Confirm `package.json` contains exactly:

```json
{
  "patchedDependencies": {
    "@earendil-works/pi-ai@0.83.0": "patches/@earendil-works%2Fpi-ai@0.83.0.patch"
  }
}
```

Run:

```bash
rg '^diff --git ' patches/@earendil-works%2Fpi-ai@0.83.0.patch
```

Expected: exactly four entries, for `dist/types.d.ts`,
`dist/api/openai-responses.d.ts`, `dist/api/openai-responses.js`, and
`dist/api/openai-responses-shared.js`.

- [ ] **Step 19: Route the known DeepSeek Responses model without claiming tool support**

Create `packages/runtime/src/models/providers/deepseek.ts` with this exact file
content:

```ts
import {
  createProvider,
  envApiKeyAuth,
  type Model,
  type Provider,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { DEEPSEEK_MODELS } from "@earendil-works/pi-ai/providers/deepseek.models";

type DeepSeekApi = "openai-completions" | "openai-responses";

export function deepseekProvider(): Provider<DeepSeekApi> {
  const models = Object.values(DEEPSEEK_MODELS).map((model) => {
    if (model.id !== "deepseek-v4-flash") {
      return model;
    }
    return {
      ...model,
      api: "openai-responses",
      compat: {
        supportsDeveloperRole: false,
        supportsLongCacheRetention: false,
        sessionAffinityFormat: "openai-nosession",
      },
    } satisfies Model<"openai-responses">;
  });

  return createProvider<DeepSeekApi>({
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    auth: {
      apiKey: envApiKeyAuth("DeepSeek API key", ["DEEPSEEK_API_KEY"]),
    },
    models,
    api: {
      "openai-completions": openAICompletionsApi(),
      "openai-responses": openAIResponsesApi(),
    },
  });
}
```

In `packages/runtime/src/models/providers/builtin-providers.ts`, import the
local factory and register its result:

```ts
import { deepseekProvider } from "./deepseek";

deepseek: deepseekProvider(),
```

This routing means the model uses a Responses-compatible transport; it does not assert that DeepSeek accepts OpenAI's hosted tool types or returns every OpenAI output item.

- [ ] **Step 20: Verify the runtime and dependency bridge**

Run:

```bash
bun install
bun test packages/core/src/client/converters.test.ts packages/core/src/client/reducer.test.ts packages/core/src/server/agent/stream.test.ts packages/core/src/server/agent/pi-ai-native-tools.test.ts packages/runtime/src/models/providers/deepseek.test.ts
```

Expected: `bun install` reports the pi-ai patch applied and exits 0; all focused tests pass, raw fields remain unchanged, hosted tools are absent from local execution, and response output replays in provider order.

- [ ] **Step 21: Commit the runtime bridge**

```bash
git add package.json bun.lock patches packages/core/src/types/agent.ts packages/core/src/client packages/core/src/server/agent packages/runtime/src/streaming packages/runtime/src/models/providers
git commit -m "feat: bridge provider-hosted tools to responses adapters"
```

### Task 3: Add configuration and read-only response presentation

**Files:**
- Create: `packages/ui/src/components/thread-playground/tool/provider-hosted-tool-config.ts`
- Create: `packages/ui/src/components/thread-playground/tool/provider-hosted-tool-config.test.ts`
- Create: `packages/ui/src/components/thread-playground/tool/provider-hosted-tool-editor-dialog.tsx`
- Modify: `packages/ui/src/components/thread-playground/tool/tool-list-view.tsx`
- Modify: `packages/ui/src/components/thread-playground/tool/tool-list-item.tsx`
- Create: `packages/ui/src/components/thread-playground/message/provider-hosted-tool-activity-utils.ts`
- Create: `packages/ui/src/components/thread-playground/message/provider-hosted-tool-activity-utils.test.ts`
- Create: `packages/ui/src/components/thread-playground/message/provider-hosted-tool-activity-list.tsx`
- Create: `packages/ui/src/components/thread-playground/message/citation-list.tsx`
- Create: `packages/ui/src/components/thread-playground/message/text-citation-utils.ts`
- Create: `packages/ui/src/components/thread-playground/message/text-citation-utils.test.ts`
- Create: `packages/ui/src/components/thread-playground/message/use-text-citation-extension.ts`
- Modify: `packages/ui/src/components/thread-playground/message/message-list-item.tsx`
- Modify: `packages/ui/src/components/thread-playground/message/message-list-item-header.tsx`
- Modify: `packages/ui/src/components/thread-playground/message/use-tool-call-runner.ts`
- Modify: `packages/ui/src/components/thread-playground/stores/thread-store.ts`
- Modify: `packages/ui/tests/components/thread-playground/stores/thread-store.test.ts`

- [ ] **Step 1: Create the parser RED tests**

Create
`packages/ui/src/components/thread-playground/tool/provider-hosted-tool-config.test.ts`
with this exact content:

```ts
import { describe, expect, test } from "bun:test";

import { parseProviderHostedToolConfig } from "./provider-hosted-tool-config";

describe("parseProviderHostedToolConfig", () => {
  test("preserves tool-specific fields", () => {
    expect(
      parseProviderHostedToolConfig(`{
        "type": "web_search",
        "search_context_size": "high",
        "user_location": { "type": "approximate", "country": "CN" }
      }`)
    ).toEqual({
      type: "web_search",
      search_context_size: "high",
      user_location: { type: "approximate", country: "CN" },
    });
  });

  test.each([
    ["{", "Invalid JSON."],
    ["[]", "Provider-hosted tool configuration must be a JSON object."],
    ["{}", 'Provider-hosted tool "type" must be a non-empty string.'],
    [
      '{"type":"   "}',
      'Provider-hosted tool "type" must be a non-empty string.',
    ],
    [
      '{"type":"function"}',
      'Use Add Custom Function Tool for "function" or "custom" tools.',
    ],
    [
      '{"type":"custom"}',
      'Use Add Custom Function Tool for "function" or "custom" tools.',
    ],
  ])("rejects invalid config %s", (source, message) => {
    expect(() => parseProviderHostedToolConfig(source)).toThrow(message);
  });
});
```

Run:

```bash
bun test packages/ui/src/components/thread-playground/tool/provider-hosted-tool-config.test.ts
```

Expected: FAIL because the parser module does not exist.

- [ ] **Step 2: Add the identity RED test**

In `packages/ui/tests/components/thread-playground/stores/thread-store.test.ts`,
add `ProviderHostedTool` to the existing `@llm-space/core` type import, then
append this test block:

```ts
describe("provider-hosted tools", () => {
  const providerHostedTool: ProviderHostedTool = {
    type: "provider-hosted",
    config: { type: "web_search", search_context_size: "high" },
  };

  test("uses provider-hosted identity for add, duplicate, update, and removal", () => {
    const store = createThreadStore({});

    expect(store.getState().addTool(providerHostedTool)).toBe(true);
    expect(store.getState().addTool(providerHostedTool)).toBe(false);
    expect(
      store.getState().addTool({
        type: "function",
        name: "web_search",
        description: "Client function",
        parameters: { type: "object" },
      })
    ).toBe(true);
    expect(
      store.getState().updateTool("provider-hosted:web_search", {
        type: "provider-hosted",
        config: { type: "file_search", vector_store_ids: ["vs_1"] },
      })
    ).toBe(true);

    expect(store.getState().thread.context?.tools).toHaveLength(2);
    store.getState().removeTool("provider-hosted:file_search");
    expect(store.getState().thread.context?.tools).toEqual([
      expect.objectContaining({ type: "function", name: "web_search" }),
    ]);
  });
});
```

Run:

```bash
bun test packages/ui/tests/components/thread-playground/stores/thread-store.test.ts -t "uses provider-hosted identity for add, duplicate, update, and removal"
```

Expected: FAIL because store CRUD still assumes every tool is keyed by a
top-level `name`.

- [ ] **Step 3: Add the activity-only store RED test**

Insert this test after the identity test, inside the same `describe` block:

```ts
test("forwards provider-hosted config and retains an activity-only final message", async () => {
  let capturedRequest: AgentStreamRequest | undefined;
  const finalAssistant = {
    role: "assistant",
    content: [],
    nativeToolActivities: [
      {
        id: "ws_1",
        type: "web_search_call",
        status: "completed",
        raw: { id: "ws_1", type: "web_search_call" },
      },
    ],
    responseOutputItems: [{ id: "ws_1", type: "web_search_call" }],
    api: "openai-responses",
    provider: "openai",
    model: "gpt-test",
    usage: {
      input: 1,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 1,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  } as const;
  const events = [
    { type: "message_start", message: finalAssistant } as unknown as AgentEvent,
    { type: "message_end", message: finalAssistant } as unknown as AgentEvent,
  ];
  const transport: AgentTransport = async function* (request) {
    capturedRequest = request;
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    yield* events;
  };
  const store = createThreadStore(
    {
      model: { id: "gpt-test", provider: "openai" },
      context: {
        tools: [providerHostedTool],
        messages: [
          {
            id: "user-1",
            role: "user",
            content: [{ type: "text", text: "Search" }],
          },
        ],
      },
    },
    {
      resolveModel: (saved) => saved ?? null,
      transport,
    }
  );

  await store.getState().run();

  expect(capturedRequest?.context.responseApiNativeTools).toEqual([
    providerHostedTool.config,
  ]);
  const assistant = store.getState().thread.context?.messages?.at(-1);
  expect(assistant?.role).toBe("assistant");
  if (assistant?.role !== "assistant") throw new Error("Expected assistant");
  expect(assistant.providerHostedToolActivities).toHaveLength(1);
  expect(assistant.responseOutputItems).toHaveLength(1);
});
```

Run:

```bash
bun test packages/ui/tests/components/thread-playground/stores/thread-store.test.ts -t "forwards provider-hosted config and retains an activity-only final message"
```

Expected: FAIL because hosted config is not forwarded and an assistant message
with no text or client tool call is treated as empty.

- [ ] **Step 4: Create the activity presentation RED tests**

Create
`packages/ui/src/components/thread-playground/message/provider-hosted-tool-activity-utils.test.ts`
with this exact content:

```ts
import { describe, expect, test } from "bun:test";

import type { ProviderHostedToolActivity, TextContent } from "@llm-space/core";

import {
  collectCitations,
  summarizeProviderHostedActivity,
} from "./provider-hosted-tool-activity-utils";

describe("provider-hosted tool activity presentation", () => {
  test("deduplicates safe URL citations in first-seen order", () => {
    const contents: TextContent[] = [
      {
        type: "text",
        text: "AB",
        annotations: [
          {
            type: "url_citation",
            url: "https://example.com/a",
            title: "A",
            raw: {},
          },
          {
            type: "url_citation",
            url: "javascript:alert(1)",
            raw: {},
          },
          {
            type: "url_citation",
            url: "https://example.com/a",
            title: "Duplicate",
            raw: {},
          },
          {
            type: "url_citation",
            url: "https://example.com/b",
            title: "B",
            raw: {},
          },
        ],
      },
    ];

    expect(collectCitations(contents)).toEqual([
      { url: "https://example.com/a", title: "A" },
      { url: "https://example.com/b", title: "B" },
    ]);
  });

  test("summarizes unknown provider output without inventing sources", () => {
    const activity: ProviderHostedToolActivity = {
      type: "image_generation_call",
      status: "completed",
      raw: { type: "image_generation_call", status: "completed" },
    };
    expect(summarizeProviderHostedActivity(activity)).toEqual({
      label: "image_generation_call",
      status: "completed",
      sources: [],
    });
  });

  test("uses normalized activity sources before raw web-search sources", () => {
    const activity: ProviderHostedToolActivity = {
      type: "web_search_call",
      status: "completed",
      action: { type: "search", query: "LLM Space" },
      sources: [{ url: "https://example.com/a", title: "A" }],
      raw: {
        type: "web_search_call",
        action: {
          sources: [{ url: "https://example.com/raw", title: "Raw" }],
        },
      },
    };
    expect(summarizeProviderHostedActivity(activity)).toEqual({
      label: "web_search_call",
      status: "completed",
      query: "LLM Space",
      sources: [{ url: "https://example.com/a", title: "A" }],
    });
  });
});
```

Run:

```bash
bun test packages/ui/src/components/thread-playground/message/provider-hosted-tool-activity-utils.test.ts
```

Expected: FAIL because safe-source collection and generic hosted-activity
summarization do not exist.

- [ ] **Step 5: Create the citation-range RED tests**

Create
`packages/ui/src/components/thread-playground/message/text-citation-utils.test.ts`
with this exact content:

```ts
import { describe, expect, test } from "bun:test";

import type { TextContent } from "@llm-space/core";

import { normalizeCitationRanges } from "./text-citation-utils";

function _content(
  annotations: NonNullable<TextContent["annotations"]>,
  text = "LLM Space"
): TextContent[] {
  return [{ type: "text", text, annotations }];
}

describe("normalizeCitationRanges", () => {
  test("maps valid block-local ranges into joined editor text", () => {
    expect(
      normalizeCitationRanges(
        _content([
          {
            type: "url_citation",
            url: "https://example.com/a",
            title: "A",
            startIndex: 0,
            endIndex: 9,
            raw: {},
          },
        ])
      )
    ).toEqual([
      { from: 0, to: 9, url: "https://example.com/a", title: "A" },
    ]);
  });

  test.each([
    [{ startIndex: -1, endIndex: 3 }, "out-of-bounds"],
    [{ startIndex: 5, endIndex: 2 }, "reversed"],
    [{ startIndex: 0, endIndex: 3, url: "javascript:alert(1)" }, "unsafe URL"],
  ])("drops %s ranges", (range) => {
    expect(
      normalizeCitationRanges(
        _content([
          {
            type: "url_citation",
            url: "url" in range ? range.url : "https://example.com/a",
            startIndex: range.startIndex,
            endIndex: range.endIndex,
            raw: {},
          },
        ])
      )
    ).toEqual([]);
  });

  test("keeps the first sorted range and rejects a later overlap", () => {
    expect(
      normalizeCitationRanges(
        _content([
          {
            type: "url_citation",
            url: "https://example.com/a",
            title: "A",
            startIndex: 0,
            endIndex: 6,
            raw: {},
          },
          {
            type: "url_citation",
            url: "https://example.com/b",
            title: "B",
            startIndex: 4,
            endIndex: 9,
            raw: {},
          },
        ])
      )
    ).toEqual([
      { from: 0, to: 6, url: "https://example.com/a", title: "A" },
    ]);
  });

  test("accounts for newlines between text blocks", () => {
    expect(
      normalizeCitationRanges([
        { type: "text", text: "First" },
        {
          type: "text",
          text: "Second",
          annotations: [
            {
              type: "url_citation",
              url: "https://example.com/b",
              startIndex: 0,
              endIndex: 6,
              raw: {},
            },
          ],
        },
      ])
    ).toEqual([{ from: 6, to: 12, url: "https://example.com/b" }]);
  });
});
```

Run:

```bash
bun test packages/ui/src/components/thread-playground/message/text-citation-utils.test.ts
```

Expected: FAIL because citation ranges are not yet normalized or filtered.

- [ ] **Step 6: Implement the generic JSON editor**

Create `provider-hosted-tool-config.ts` with these imports, the compiled
validator, and the parser so every identifier used below is declared:

```ts
import {
  ProviderHostedToolConfig,
  type ProviderHostedToolConfig as ProviderHostedToolConfigType,
} from "@llm-space/core";
import { Compile } from "typebox/compile";

const PROVIDER_HOSTED_TOOL_CONFIG_VALIDATOR = Compile(
  ProviderHostedToolConfig
);

export function parseProviderHostedToolConfig(
  source: string
): ProviderHostedToolConfigType {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("Invalid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "Provider-hosted tool configuration must be a JSON object."
    );
  }
  const type = (parsed as { type?: unknown }).type;
  if (typeof type !== "string" || type.trim().length === 0) {
    throw new Error(
      'Provider-hosted tool "type" must be a non-empty string.'
    );
  }
  if (type === "function" || type === "custom") {
    throw new Error(
      'Use Add Custom Function Tool for "function" or "custom" tools.'
    );
  }
  if (!PROVIDER_HOSTED_TOOL_CONFIG_VALIDATOR.Check(parsed)) {
    throw new Error(
      "Provider-hosted tool configuration must contain JSON values only."
    );
  }
  return parsed;
}
```

Default the editor to `{ "type": "web_search" }`. Explain that additional fields are forwarded unchanged, capability is not preflighted, and Auto run tools does not own execution. The editor configures only the individual tool object; request-level controls such as `tool_choice`, `include`, `reasoning`, and `background` do not belong in this JSON editor.

- [ ] **Step 7: Implement the provider-hosted editor dialog**

Create `provider-hosted-tool-editor-dialog.tsx` with this file directive,
imports, state, save path, and JSX:

```tsx
"use client";

import {
  getToolKey,
  type ProviderHostedTool,
  type ProviderHostedToolConfig,
} from "@llm-space/core";
import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  CodeEditor,
  type CodeEditorHandle,
} from "@llm-space/ui/components/code-editor";
import { Button } from "@llm-space/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";

import { useThreadStoreActions } from "../stores/thread-store";
import { parseProviderHostedToolConfig } from "./provider-hosted-tool-config";

const DEFAULT_PROVIDER_HOSTED_TOOL_CONFIG: ProviderHostedToolConfig = {
  type: "web_search",
};

export function ProviderHostedToolEditorDialog({
  open,
  onOpenChange,
  tool,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tool: ProviderHostedTool | null;
}) {
  const { addTool, updateTool } = useThreadStoreActions();
  const editorRef = useRef<CodeEditorHandle>(null);
  const [text, setText] = useState("");
  const [originalKey, setOriginalKey] = useState<string | null>(null);
  const [prevOpen, setPrevOpen] = useState(false);
  const [prevTool, setPrevTool] = useState(tool);

  if (open !== prevOpen || tool !== prevTool) {
    setPrevOpen(open);
    setPrevTool(tool);
    if (open) {
      setOriginalKey(tool ? getToolKey(tool) : null);
      setText(
        JSON.stringify(
          tool?.config ?? DEFAULT_PROVIDER_HOSTED_TOOL_CONFIG,
          null,
          2
        )
      );
    }
  }

  const handleSave = () => {
    let config: ProviderHostedToolConfig;
    try {
      config = parseProviderHostedToolConfig(
        editorRef.current?.getValue() ?? text
      );
    } catch (error) {
      toast.error("Invalid provider-hosted tool configuration", {
        description:
          error instanceof Error ? error.message : "Invalid configuration.",
      });
      return;
    }
    const nextTool: ProviderHostedTool = {
      type: "provider-hosted",
      config,
    };
    const saved = originalKey
      ? updateTool(originalKey, nextTool)
      : addTool(nextTool);
    if (saved) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[65vh]! w-full flex-col gap-4 sm:max-w-3xl"
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {tool ? "Edit provider-hosted tool" : "Add provider-hosted tool"}
          </DialogTitle>
          <DialogDescription>
            This JSON is passed directly to the selected model service. Fields
            beyond type are preserved unchanged. LLM Space does not verify
            whether the selected provider or model supports the tool or its
            parameters. Provider-hosted tools run inside the model request and
            are not controlled by Auto run tools.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="text-sm font-medium">Configuration</div>
          <CodeEditor
            ref={editorRef}
            className="min-h-64 flex-1 font-mono text-sm"
            language="json"
            value={text}
            autoFocus
            onChange={setText}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>{tool ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 8: Implement keyed store CRUD and activity-only retention**

Replace the store's three tool actions with:

```ts
addTool(tool) {
  const { thread } = get();
  const toolKey = getToolKey(tool);
  if (thread.context?.tools?.some((item) => getToolKey(item) === toolKey)) {
    toast.error("Error", {
      description: `Tool "${getToolDisplayName(tool)}" already exists`,
    });
    return false;
  }
  if (!validateTool(tool)) return false;
  patchContext({ tools: [...(thread.context?.tools ?? []), tool] });
  return true;
},
updateTool(name, tool) {
  const tools = get().thread.context?.tools ?? [];
  const index = tools.findIndex((item) => getToolKey(item) === name);
  if (index === -1 || !validateTool(tool)) return false;
  const nextKey = getToolKey(tool);
  if (
    nextKey !== name &&
    tools.some((item) => getToolKey(item) === nextKey)
  ) {
    toast.error("Error", {
      description: `Tool "${getToolDisplayName(tool)}" already exists`,
    });
    return false;
  }
  const next = [...tools];
  next[index] = tool;
  patchContext({ tools: next });
  return true;
},
removeTool(name) {
  patchContext({
    tools: get().thread.context?.tools?.filter(
      (tool) => getToolKey(tool) !== name
    ),
  });
},
```

Count hosted activity in completed/streaming content checks:

```ts
const hasContent = (message: AssistantMessage): boolean =>
  Boolean(message.thinking) ||
  message.content.length > 0 ||
  (message.toolCalls?.length ?? 0) > 0 ||
  (message.providerHostedToolActivities?.length ?? 0) > 0;

if (
  event.type === "message_end" &&
  event.message.role === "assistant" &&
  (event.message.nativeToolActivities?.length ?? 0) > 0
) {
  return true;
}
```

Apply the executable-map edit in
`packages/ui/src/components/thread-playground/stores/thread-store.ts`. The file
already imports `isExecutableTool` from `@llm-space/core`; Step 8 also adds
`getToolDisplayName` and `getToolKey` to that same import.

```diff
 const toolsByName = new Map(
-  (get().thread.context?.tools ?? []).map((tool) => [tool.name, tool])
+  (get().thread.context?.tools ?? [])
+    .filter(isExecutableTool)
+    .map((tool) => [tool.name, tool])
 );
```

Apply the second executable-map edit in
`packages/ui/src/components/thread-playground/message/use-tool-call-runner.ts`.
Keep its existing exact core import, which already declares the predicate:

```ts
import { isExecutableTool, type Tool, type ToolCall } from "@llm-space/core";
```

```diff
 const toolsByName = useMemo(
-  () => new Map((tools ?? []).map((tool) => [tool.name, tool])),
+  () =>
+    new Map(
+      (tools ?? [])
+        .filter(isExecutableTool)
+        .map((tool) => [tool.name, tool])
+    ),
   [tools]
 );
```

These are the only two name maps used to resolve executable tools. Filtering
both prevents provider-hosted definitions from entering manual execution or
the Auto run/ReAct continuation path.

- [ ] **Step 9: Add the menu and identity-safe chip**

Apply these focused hunks to `tool-list-view.tsx`. They declare every dialog
callback and state value before the menu references them, exclude name-less
hosted tools from the client-tool name set, use canonical keys for rendering
and removal, and mount the editor dialog:

```diff
-import { type FunctionTool, type Tool } from "@llm-space/core";
+import {
+  getToolKey,
+  isProviderHostedTool,
+  type FunctionTool,
+  type ProviderHostedTool,
+  type Tool,
+} from "@llm-space/core";
 import {
   CableIcon,
+  CloudIcon,
   FunctionSquareIcon,
```

```diff
 import { BuiltInToolImportDialog } from "./built-in-tool-import-dialog";
 import { McpToolImportDialog } from "./mcp-tool-import-popover";
+import { ProviderHostedToolEditorDialog } from "./provider-hosted-tool-editor-dialog";
 import { ToolEditorDialog } from "./tool-editor-dialog";
```

```diff
 const [dialogOpen, setDialogOpen] = useState(false);
+const [providerHostedDialogOpen, setProviderHostedDialogOpen] =
+  useState(false);
 const [mcpOpen, setMcpOpen] = useState(false);
```

```diff
 const [editingTool, setEditingTool] = useState<FunctionTool | null>(null);
+const [editingProviderHostedTool, setEditingProviderHostedTool] =
+  useState<ProviderHostedTool | null>(null);
 const existingToolNames = useMemo(
-  () => new Set((tools ?? []).map((tool) => tool.name)),
+  () =>
+    new Set(
+      (tools ?? [])
+        .filter((tool) => !isProviderHostedTool(tool))
+        .map((tool) => tool.name)
+    ),
   [tools]
 );
```

Insert the add callback immediately after `openAddDialog`, and insert the
provider-hosted branch at the start of `openEditDialog`:

```diff
+const openAddProviderHostedDialog = useCallback(() => {
+  setEditingProviderHostedTool(null);
+  setProviderHostedDialogOpen(true);
+}, []);
+
 const openEditDialog = useCallback((tool: Tool) => {
+  if (tool.type === "provider-hosted") {
+    setEditingProviderHostedTool(tool);
+    setProviderHostedDialogOpen(true);
+    return;
+  }
   if (tool.type === "mcp") {
```

Use canonical keys in both mutation and render paths:

```diff
 const handleRemoveTool = useCallback(
   (tool: Tool) => {
-    removeTool(tool.name);
+    removeTool(getToolKey(tool));
   },
   [removeTool]
 );
```

```diff
 {tools?.map((t) => (
   <ToolListItem
-    key={t.name}
+    key={getToolKey(t)}
```

Insert the menu entry after `DropdownMenuSeparator`:

```tsx
<DropdownMenuItem onSelect={openAddProviderHostedDialog}>
  <CloudIcon />
  Add Provider-Hosted Tool
</DropdownMenuItem>
```

Mount the hosted editor immediately after `ToolEditorDialog`:

```tsx
<ProviderHostedToolEditorDialog
  open={providerHostedDialogOpen}
  onOpenChange={(open) => {
    setProviderHostedDialogOpen(open);
    if (!open) {
      setEditingProviderHostedTool(null);
    }
  }}
  tool={editingProviderHostedTool}
/>
```

Apply these focused hunks to `tool-list-item.tsx` to make hosted definitions
safe to render even though they do not have `name`, `description`, or
`parameters` fields:

```diff
-import { type Tool } from "@llm-space/core";
-import { CableIcon, FunctionSquareIcon, XIcon } from "lucide-react";
+import {
+  getToolDisplayName,
+  isProviderHostedTool,
+  type Tool,
+} from "@llm-space/core";
+import { CableIcon, CloudIcon, FunctionSquareIcon, XIcon } from "lucide-react";
```

```diff
+const providerHosted = isProviderHostedTool(tool);
+const parameters = providerHosted ? undefined : tool.parameters;
 const keys = useMemo(
   () =>
     Object.keys(
-      (tool.parameters as Record<string, unknown>).properties ?? {}
+      (parameters as Record<string, unknown> | undefined)?.properties ?? {}
     ),
-  [tool.parameters]
+  [parameters]
 );
 const required = useMemo(
-  () => (tool.parameters as { required: string[] }).required ?? [],
-  [tool.parameters]
+  () => (parameters as { required?: string[] } | undefined)?.required ?? [],
+  [parameters]
 );
+const displayName = getToolDisplayName(tool);
```

Replace the `ToolIcon` expression with:

```ts
const ToolIcon = providerHosted
  ? CloudIcon
  : tool.type === "mcp"
    ? CableIcon
    : tool.type === "builtin"
      ? getBuiltInToolIcon(tool)
      : FunctionSquareIcon;
```

Wrap the existing function/MCP/built-in tooltip with this exact branch hunk;
the unchanged `<div>` body remains in place between the shown context lines:

```diff
 <Tooltip
   content={
+    providerHosted ? (
+      <div className="max-w-80 text-xs">
+        <div className="font-mono font-bold">{displayName}</div>
+        <div className="pt-1 opacity-60">
+          Runs inside the provider&apos;s model request.
+        </div>
+        <pre className="mt-2 overflow-auto">
+          {JSON.stringify(tool.config, null, 2)}
+        </pre>
+      </div>
+    ) : (
       <div>
         <div className="font-mono">
-          <span className="text-primary font-bold">{tool.name}</span>
+          <span className="text-primary font-bold">{displayName}</span>
```

Close that branch immediately after the unchanged tooltip `<div>`:

```diff
         </div>
       </div>
+    )
   }
 >
```

Apply the display-name and aria-label hunk in the edit/remove controls:

```diff
 aria-label={
   tool.type === "function"
-    ? `Edit ${tool.name} tool`
-    : `Manage ${tool.name} ${tool.type === "mcp" ? "MCP" : "built-in"} tool`
+    ? `Edit ${displayName} tool`
+    : `Manage ${displayName} ${tool.type === "mcp" ? "MCP" : tool.type === "builtin" ? "built-in" : "provider-hosted"} tool`
 }
```

```diff
-<span className="font-mono">{tool.name}</span>
+<span className="font-mono">{displayName}</span>
```

```diff
-aria-label={`Remove ${tool.name} tool`}
+aria-label={`Remove ${displayName} tool`}
```

- [ ] **Step 10: Implement activity and source normalization**

In `provider-hosted-tool-activity-utils.ts`, implement the public URL guard and
summary with these exact bodies:

```ts
import type { ProviderHostedToolActivity, TextContent } from "@llm-space/core";

export interface CitationLink {
  url: string;
  title?: string;
}

export interface ProviderHostedActivitySummary {
  label: string;
  status?: string;
  query?: string;
  sources: CitationLink[];
}

export function normalizeSafeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function collectCitations(
  contents: readonly TextContent[]
): CitationLink[] {
  const seen = new Set<string>();
  const result: CitationLink[] = [];
  for (const content of contents) {
    for (const annotation of content.annotations ?? []) {
      const url = normalizeSafeUrl(annotation.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      result.push({
        url,
        ...(annotation.title ? { title: annotation.title } : {}),
      });
    }
  }
  return result;
}

export function summarizeProviderHostedActivity(
  activity: ProviderHostedToolActivity
): ProviderHostedActivitySummary {
  const normalizedSources = _normalizeSources(activity.sources);
  const rawAction =
    activity.raw.action &&
    typeof activity.raw.action === "object" &&
    !Array.isArray(activity.raw.action)
      ? activity.raw.action
      : undefined;
  const rawSources = _normalizeSources(rawAction?.sources);
  const action = activity.action;
  return {
    label: activity.type,
    ...(activity.status ? { status: activity.status } : {}),
    ...(typeof action?.query === "string" ? { query: action.query } : {}),
    sources: normalizedSources.length > 0 ? normalizedSources : rawSources,
  };
}
```

Use this exact source collector:

```ts
function _normalizeSources(value: unknown): CitationLink[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: CitationLink[] = [];
  for (const source of value) {
    if (!source || typeof source !== "object") continue;
    const record = source as { url?: unknown; title?: unknown };
    const url = normalizeSafeUrl(record.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push({
      url,
      ...(typeof record.title === "string" ? { title: record.title } : {}),
    });
  }
  return result;
}
```

- [ ] **Step 11: Implement citation-range normalization**

Create `text-citation-utils.ts` with this exact file content:

```ts
import type { TextContent } from "@llm-space/core";
import { normalizeSafeUrl } from "./provider-hosted-tool-activity-utils";

export interface CitationRange {
  from: number;
  to: number;
  url: string;
  title?: string;
}

export function normalizeCitationRanges(
  contents: readonly TextContent[]
): CitationRange[] {
  const candidates: CitationRange[] = [];
  let blockOffset = 0;
  for (const content of contents) {
    for (const annotation of content.annotations ?? []) {
      const { startIndex, endIndex } = annotation;
      const url = normalizeSafeUrl(annotation.url);
      if (
        !url ||
        !Number.isInteger(startIndex) ||
        !Number.isInteger(endIndex) ||
        startIndex === undefined ||
        endIndex === undefined ||
        startIndex < 0 ||
        endIndex <= startIndex ||
        endIndex > content.text.length
      ) {
        continue;
      }
      candidates.push({
        from: blockOffset + startIndex,
        to: blockOffset + endIndex,
        url,
        ...(annotation.title ? { title: annotation.title } : {}),
      });
    }
    blockOffset += content.text.length + 1;
  }
  candidates.sort(
    (left, right) => left.from - right.from || left.to - right.to
  );
  const result: CitationRange[] = [];
  for (const candidate of candidates) {
    if (result.length > 0 && candidate.from < result[result.length - 1].to) {
      continue;
    }
    result.push(candidate);
  }
  return result;
}
```

- [ ] **Step 12: Compose memoized read-only response UI**

Create `provider-hosted-tool-activity-list.tsx` with this exact file content:

```tsx
import type { ProviderHostedToolActivity } from "@llm-space/core";
import { CloudIcon } from "lucide-react";
import { memo, useMemo } from "react";

import { Link } from "@llm-space/ui/components/link";
import { summarizeProviderHostedActivity } from "./provider-hosted-tool-activity-utils";

function _ProviderHostedToolActivityList({
  activities,
}: {
  activities: readonly ProviderHostedToolActivity[];
}) {
  const summaries = useMemo(
    () => activities.map(summarizeProviderHostedActivity),
    [activities]
  );
  if (activities.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 px-2 pt-2 pb-1">
      {activities.map((activity, index) => {
        const summary = summaries[index];
        return (
          <details
            key={activity.id ?? `${activity.type}-${index}`}
            className="bg-secondary/50 rounded-md px-2.5 py-2 text-xs"
          >
            <summary className="flex cursor-pointer list-none items-center gap-2">
              <CloudIcon className="size-3.5 opacity-70" />
              <span className="font-mono font-medium">{summary.label}</span>
              {summary.status && (
                <span className="text-muted-foreground">{summary.status}</span>
              )}
              {summary.query && (
                <span className="text-muted-foreground truncate">
                  {summary.query}
                </span>
              )}
              {summary.sources.length > 0 && (
                <span className="text-muted-foreground ml-auto">
                  {summary.sources.length} source
                  {summary.sources.length === 1 ? "" : "s"}
                </span>
              )}
            </summary>
            {summary.sources.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {summary.sources.map((source) => (
                  <Link
                    key={source.url}
                    className="truncate underline underline-offset-2"
                    href={source.url}
                  >
                    {source.title ?? new URL(source.url).hostname}
                  </Link>
                ))}
              </div>
            )}
            <pre className="bg-background/50 mt-2 max-h-56 overflow-auto rounded p-2 whitespace-pre-wrap">
              {JSON.stringify(activity.raw, null, 2)}
            </pre>
          </details>
        );
      })}
    </div>
  );
}

export const ProviderHostedToolActivityList = memo(
  _ProviderHostedToolActivityList
);
```

Create `citation-list.tsx` with:

```tsx
import type { TextContent } from "@llm-space/core";
import { memo, useMemo } from "react";
import { Link } from "@llm-space/ui/components/link";
import { collectCitations } from "./provider-hosted-tool-activity-utils";

function _CitationList({ contents }: { contents: readonly TextContent[] }) {
  const citations = useMemo(() => collectCitations(contents), [contents]);
  if (citations.length === 0) return null;
  return (
    <div className="text-muted-foreground flex flex-wrap gap-2 px-2 pb-2 text-xs">
      {citations.map((citation, index) => (
        <Link
          key={citation.url}
          className="hover:text-foreground underline underline-offset-2"
          href={citation.url}
          title={citation.title}
        >
          [{index + 1}] {citation.title ?? new URL(citation.url).hostname}
        </Link>
      ))}
    </div>
  );
}

export const CitationList = memo(_CitationList);
```

Create `use-text-citation-extension.ts` with:

```ts
import { type Extension } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import type { TextContent } from "@llm-space/core";
import { useMemo } from "react";
import { useHostServices } from "@llm-space/ui/host";
import { normalizeCitationRanges } from "./text-citation-utils";

export function useTextCitationExtension(
  contents: readonly TextContent[]
): Extension[] {
  const { actions } = useHostServices();
  return useMemo(() => {
    const ranges = normalizeCitationRanges(contents);
    if (ranges.length === 0) return [];
    const decorations = Decoration.set(
      ranges.map((range) =>
        Decoration.mark({
          class:
            "text-primary cursor-pointer underline decoration-dotted underline-offset-2",
          attributes: {
            "data-native-citation-url": range.url,
            ...(range.title ? { title: range.title } : {}),
          },
        }).range(range.from, range.to)
      ),
      true
    );
    return [
      EditorView.decorations.of(decorations),
      EditorView.domEventHandlers({
        click(event) {
          const element =
            event.target instanceof Element
              ? event.target.closest<HTMLElement>(
                  "[data-native-citation-url]"
                )
              : null;
          const url = element?.dataset.nativeCitationUrl;
          if (!url) return false;
          event.preventDefault();
          actions.openLink(url);
          return true;
        },
      }),
    ];
  }, [actions, contents]);
}
```

Apply only these hunks to the current `message-list-item.tsx`; do not replace
the component body. First add the presentation imports beside the existing
message imports:

```diff
+import { CitationList } from "./citation-list";
 import { ImageContentList } from "./image-content-view";
 import { MessageListItemHeader } from "./message-list-item-header";
+import { ProviderHostedToolActivityList } from "./provider-hosted-tool-activity-list";
 import { ThinkingView } from "./thinking-view";
 import { ToolCallListItem } from "./tool-call-list-item";
+import { useTextCitationExtension } from "./use-text-citation-extension";
 import { useToolCallRunner } from "./use-tool-call-runner";
```

Immediately after `variableExtension`, insert the stable text/citation
derivations:

```ts
const assistantTextContents = useMemo(
  () =>
    message.role === "assistant"
      ? message.content.filter((content) => content.type === "text")
      : [],
  [message]
);
const citationExtension = useTextCitationExtension(assistantTextContents);
const editorExtensions = useMemo(
  () => [...(variableExtension ?? []), ...citationExtension],
  [citationExtension, variableExtension]
);
```

Exclude hosted activity from the existing `toolCallsOnlyBody` predicate:

```diff
 const toolCallsOnlyBody = useMemo(
   () =>
     message.role === "assistant" &&
     !message.thinking &&
     message.content.length === 0 &&
+    (message.providerHostedToolActivities?.length ?? 0) === 0 &&
     (message.toolCalls?.length ?? 0) > 0,
   [message]
 );
```

Extend the existing streaming-skeleton condition and insert hosted activity
immediately after `ThinkingView`:

```diff
 {message.role === "assistant" &&
   streaming &&
   !message.thinking &&
   message.content.length === 0 &&
+  (!message.providerHostedToolActivities ||
+    message.providerHostedToolActivities.length === 0) &&
   (!message.toolCalls || message.toolCalls.length === 0) && (
     <StreamingMessageSkeleton className="mt-2" />
   )}
 {message.role === "assistant" && message.thinking && (
   <ThinkingView className="mt-2" thinking={message.thinking} />
 )}
+{message.role === "assistant" &&
+  message.providerHostedToolActivities &&
+  message.providerHostedToolActivities.length > 0 && (
+    <ProviderHostedToolActivityList
+      activities={message.providerHostedToolActivities}
+    />
+  )}
```

Replace only the opening condition around the existing `CodeEditor`, keep all
of its current props, and change only `extraExtensions`. The context below
explicitly preserves `autoFocus`, `hideFocusRing`, `hideBorder`,
`scrollOnFocus`, `plain`, and `placeholder`:

```diff
-{message.content.length > 0 && (
+{message.content.length > 0 &&
+  (text.length > 0 ||
+    message.role !== "assistant" ||
+    !message.providerHostedToolActivities?.length) && (
   <CodeEditor
     className="max-h-[40vh] min-h-9.5 w-full bg-transparent"
     autoFocus={autoFocus}
     hideFocusRing
     hideBorder
     scrollOnFocus
     plain={fidelity === "lite"}
     placeholder={
       placeholder ??
       `Enter ${message.role === "user" ? "user" : "assistant"} message here`
     }
     streaming={streaming}
     readonly={readonly}
     value={text}
-    extraExtensions={variableExtension}
+    extraExtensions={editorExtensions}
     onChange={handleTextContentChange}
     onKeyDown={handleKeyDown}
     onPaste={handlePaste}
   />
 )}
+{message.role === "assistant" && (
+  <CitationList contents={assistantTextContents} />
+)}
```

In `message-list-item-header.tsx`, extend the existing collapsed preview after
the client tool-call summary and before `return ""`:

```ts
if (
  message.role === "assistant" &&
  message.providerHostedToolActivities?.length
) {
  return message.providerHostedToolActivities
    .map((activity) => activity.type)
    .join(", ");
}
```

Provider-hosted activities stay read-only: they do not enter
`ToolCallListItem`, approval, Execute, or missing-result rendering.

- [ ] **Step 13: Verify the UI and store behavior**

Run:

```bash
bun test packages/ui/src/components/thread-playground/tool/provider-hosted-tool-config.test.ts packages/ui/src/components/thread-playground/message/provider-hosted-tool-activity-utils.test.ts packages/ui/src/components/thread-playground/message/text-citation-utils.test.ts packages/ui/tests/components/thread-playground/stores/thread-store.test.ts
```

Expected: exit 0; opaque fields round-trip, identity operations are stable,
unsafe citation data is ignored, and activity-only responses persist. The first
full typecheck runs in Task 4 only after context-export narrowing and both RPC
fixtures have been updated.

- [ ] **Step 14: Commit the UI and presentation**

```bash
git add packages/ui/src/components/thread-playground packages/ui/tests/components/thread-playground
git commit -m "feat: configure and render provider-hosted tools"
```

### Task 4: Close persistence, history, transport, and export gaps

**Files:**
- Modify: `packages/core/src/server/storage/local/file-system.test.ts`
- Modify: `packages/core/src/thread/run-history-utils.ts`
- Create: `packages/core/src/thread/run-history-utils.test.ts`
- Modify: `packages/core/src/generator/langgraph/context-export.ts`
- Modify: `packages/core/src/generator/langgraph/context-export.test.ts`
- Modify: `packages/core/src/generator/langgraph/index.ts`
- Create: `packages/core/src/generator/langgraph/index.test.ts`
- Modify: `apps/desktop/src/bun/rpc/stream-thread-request.test.ts`
- Modify: `apps/desktop/src/client/rpc-transport.test.ts`

- [ ] **Step 1: Add the storage round-trip characterization test**

In `packages/core/src/server/storage/local/file-system.test.ts`, append this
test inside `describe("LocalFileSystem.write", ...)`:

```ts
test("preserves provider-hosted tool configuration and response metadata", async () => {
  const fileSystem = await _createFileSystem();
  const thread: Thread = {
    title: "Native search",
    context: {
      tools: [
        {
          type: "provider-hosted",
          config: {
            type: "web_search",
            user_location: {
              type: "approximate",
              country: "CN",
            },
          },
        },
      ],
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: [
            {
              type: "text",
              text: "A cited answer",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://example.com/source",
                  title: "Example source",
                  startIndex: 2,
                  endIndex: 7,
                  raw: {
                    type: "url_citation",
                    url: "https://example.com/source",
                  },
                },
              ],
            },
          ],
          providerHostedToolActivities: [
            {
              id: "search-1",
              type: "web_search_call",
              status: "completed",
              action: { type: "search", query: "example query" },
              sources: [
                {
                  url: "https://example.com/source",
                  title: "Example source",
                },
              ],
              raw: {
                id: "search-1",
                type: "web_search_call",
                status: "completed",
              },
            },
          ],
          responseOutputItems: [
            {
              id: "search-1",
              type: "web_search_call",
              status: "completed",
            },
            {
              id: "message-1",
              type: "message",
              role: "assistant",
              content: [],
            },
          ],
        },
      ],
    },
  };

  await fileSystem.write("thread.json", thread);

  expect(await fileSystem.read("thread.json")).toEqual(thread);
});
```

Run:

```bash
bun test packages/core/src/server/storage/local/file-system.test.ts -t "preserves provider-hosted tool configuration and response metadata"
```

Expected: PASS. Task 1 already extends the persisted thread schema; this GREEN
regression proves `LocalFileSystem` remains lossless for the new fields and
does not require a storage implementation change.

- [ ] **Step 2: Create the run-history RED test**

Create `packages/core/src/thread/run-history-utils.test.ts` with this exact
content:

```ts
import { describe, expect, test } from "bun:test";

import type { ThreadSnapshot } from "../types";

import { runResultText, summarizeRun } from "./run-history-utils";

describe("provider-hosted activity run summaries", () => {
  test("does not classify an activity-only assistant response as empty", () => {
    const thread = {
      context: {
        messages: [
          {
            id: "assistant-1",
            role: "assistant",
            content: [],
            providerHostedToolActivities: [
              {
                type: "web_search_call",
                status: "completed",
                raw: { type: "web_search_call" },
              },
            ],
          },
        ],
      },
    } as ThreadSnapshot;

    expect(summarizeRun(thread)).toBe("web_search_call");
    expect(runResultText(thread)).toBe("web_search_call (completed)");
  });
});
```

Run:

```bash
bun test packages/core/src/thread/run-history-utils.test.ts
```

Expected: FAIL because run summaries consider only text and client tool calls.

- [ ] **Step 3: Add the context-export exclusion RED test**

In `packages/core/src/generator/langgraph/context-export.test.ts`, replace the
existing `buildContextExports` test with this exact block:

```ts
describe("buildContextExports", () => {
  test("exports rendered prompt, per-tool JSON, messages, and variables", () => {
    const context: ThreadContext = {
      tools: [
        {
          type: "function",
          name: "do_thing",
          description: "d",
          parameters: {},
        },
        {
          type: "mcp",
          name: "mcp__srv__fetch",
          description: "m",
          parameters: {},
          serverId: "s1",
          serverName: "srv",
          toolName: "fetch",
        },
        { type: "builtin", name: "read", description: "b", parameters: {} },
        {
          type: "provider-hosted",
          config: { type: "web_search", search_context_size: "high" },
        },
      ],
      variables: { current_date: { type: "currentDate", format: "iso-date" } },
      messages: [
        userMessage("<system-reminder>ctx</system-reminder>"),
        { id: "m2", role: "user", content: [{ type: "text", text: "hi" }] },
      ],
    };
    const rendered: ThreadContext = {
      systemPrompt: "You are helpful.",
      messages: [
        userMessage("<system-reminder>ctx</system-reminder>"),
        { id: "m2", role: "user", content: [{ type: "text", text: "hi" }] },
      ],
    };

    const files = buildContextExports(context, rendered);
    const byPath = new Map(files.map((file) => [file.path, file.contents]));

    expect(byPath.get("references/system-prompt.md")).toContain(
      "You are helpful."
    );
    expect(byPath.has("references/tools/do_thing.json")).toBe(true);
    expect(byPath.get("references/tools/mcp__srv__fetch.json")).toContain(
      '"fetch"'
    );
    expect(byPath.has("references/tools/read.json")).toBe(false);
    expect(byPath.has("references/tools/web_search.json")).toBe(false);
    expect(byPath.has("references/tools/undefined.json")).toBe(false);
    expect(byPath.get("references/messages/01-user.md")).toContain("(meta)");
    expect(byPath.get("references/messages/02-user.md")).toContain("hi");
    expect(byPath.get("references/variables.json")).toContain("current_date");
  });
});
```

Run:

```bash
bun test packages/core/src/generator/langgraph/context-export.test.ts -t "exports rendered prompt, per-tool JSON, messages, and variables"
```

Expected: FAIL before returning any files. The current filter admits the
name-less provider-hosted tool, then `slugifyToolName(tool.name)` receives
`undefined` and throws from `name.replace(...)`. It does **not** write
`references/tools/undefined.json`.

- [ ] **Step 4: Narrow context-export tools before the first typecheck**

In `packages/core/src/generator/langgraph/context-export.ts`, replace the
existing type import so both the filtered collection and `_toolExport()` share
the same narrowed union:

```diff
-import { getMessageText, type ThreadContext, type Tool } from "../../types";
+import {
+  getMessageText,
+  type FunctionTool,
+  type McpTool,
+  type ThreadContext,
+} from "../../types";
```

Narrow `_toolExport()` before narrowing the collection:

```diff
-function _toolExport(tool: Tool): unknown {
+function _toolExport(tool: FunctionTool | McpTool): unknown {
```

Then replace the existing named-tool collection in `buildContextExports()`:

```ts
const tools = (context.tools ?? []).filter(
  (tool): tool is FunctionTool | McpTool =>
    tool.type === "function" || tool.type === "mcp"
);
```

Run:

```bash
bun test packages/core/src/generator/langgraph/context-export.test.ts -t "exports rendered prompt, per-tool JSON, messages, and variables"
```

Expected: PASS; function and MCP references remain, while built-in and
provider-hosted tools produce no JSON reference.

- [ ] **Step 5: Create the pre-write LangGraph guard RED test**

Create `packages/core/src/generator/langgraph/index.test.ts` with this exact
content:

```ts
import { describe, expect, test } from "bun:test";

import type { WorkflowContext } from "../../workflow";
import type { GeneratorCapabilities, GeneratorRunInput } from "../types";

import { langgraphGenerator } from "./index";

describe("langgraphGenerator", () => {
  test("rejects provider-hosted tools before writing any files", async () => {
    const written: string[] = [];
    const capabilities: GeneratorCapabilities = {
      checkUv() {
        return Promise.resolve({ installed: false });
      },
      runUv() {
        return Promise.resolve({
          code: 0,
          stdout: "",
          stderr: "",
          timedOut: false,
        });
      },
      writeFile(_rootDir, relativePath) {
        written.push(relativePath);
        return Promise.resolve();
      },
      removeFile() {
        return Promise.resolve();
      },
    };
    const phases: string[] = [];
    const logs: string[] = [];
    const workflow: WorkflowContext = {
      phase(title) {
        phases.push(title);
      },
      log(message) {
        logs.push(message);
      },
      agent() {
        return Promise.resolve("");
      },
      parallel<T>(thunks: (() => Promise<T>)[]) {
        return Promise.all(thunks.map((thunk) => thunk()));
      },
      signal: new AbortController().signal,
    };
    const input: GeneratorRunInput = {
      targetDir: "/authorized/output",
      context: {
        tools: [
          {
            type: "provider-hosted",
            config: { type: "web_search" },
          },
        ],
      },
      rendered: {},
      systemPromptTemplate: "",
      skills: [],
      renderedVariableValues: {},
      model: { provider: "openai", id: "gpt-5" },
      modelInfo: {
        name: "GPT-5",
        anthropic: false,
        deepseekThinking: false,
        supportsReasoning: true,
      },
      capabilities,
    };

    let error: unknown;
    try {
      await langgraphGenerator.run(workflow, input);
    } catch (caught) {
      error = caught;
    }

    expect(() => {
      throw error;
    }).toThrow(
      "LangGraph export does not support provider-hosted tools"
    );
    expect(written).toEqual([]);
    expect(phases).toEqual([]);
    expect(logs).toEqual([]);
  });
});
```

Run:

```bash
bun test packages/core/src/generator/langgraph/index.test.ts
```

Expected: FAIL because export begins workflow/file work instead of rejecting
the unsupported tool before the first side effect.

- [ ] **Step 6: Verify the RPC fixtures are RED at the wire boundary**

After Step 9 in Task 2 makes `responseApiNativeTools` required, run:

```bash
mise run typecheck
```

Expected: FAIL with missing `responseApiNativeTools` diagnostics pointing to
the `REQUEST.context` object in both
`apps/desktop/src/bun/rpc/stream-thread-request.test.ts` and
`apps/desktop/src/client/rpc-transport.test.ts`.

- [ ] **Step 7: Update the Bun-side RPC request fixture**

In `apps/desktop/src/bun/rpc/stream-thread-request.test.ts`, replace the
`REQUEST` constant with:

```ts
const REQUEST: AgentStreamRequest = {
  model: { provider: "test", id: "test" },
  context: { messages: [], tools: [], responseApiNativeTools: [] },
};
```

Run:

```bash
mise run typecheck
```

Expected: FAIL only at `apps/desktop/src/client/rpc-transport.test.ts`; the
Bun-side fixture diagnostic is gone.

- [ ] **Step 8: Update the renderer RPC transport fixture**

In `apps/desktop/src/client/rpc-transport.test.ts`, replace the `REQUEST`
constant with:

```ts
const REQUEST: AgentStreamRequest = {
  model: { provider: "test", id: "test" },
  context: { messages: [], tools: [], responseApiNativeTools: [] },
};
```

Run:

```bash
mise run typecheck
```

Expected: exit 0; all RPC fixtures now satisfy the exact wire context.

- [ ] **Step 9: Include hosted activity in run-history summaries**

In `summarizeRun()`, insert this branch after the non-empty text branch and
before returning `"Empty message"`:

```ts
if (
  last.role === "assistant" &&
  last.providerHostedToolActivities?.length
) {
  return last.providerHostedToolActivities
    .map((activity) => activity.type)
    .join(", ");
}
```

In `runResultText()`, compute and include provider-hosted activity text with
this exact code:

```ts
const providerHostedText =
  message.providerHostedToolActivities
    ?.map((activity) =>
      activity.status
        ? `${activity.type} (${activity.status})`
        : activity.type
    )
    .join("\n") ?? "";
return (
  [assistantText, providerHostedText, toolText]
    .filter(Boolean)
    .join("\n\n") ||
  "Empty result"
);
```

- [ ] **Step 10: Reject unsupported LangGraph export before side effects**

At the start of `langgraphGenerator.run()`, after destructuring `context` and
before creating `written`, add:

```ts
if ((context.tools ?? []).some(isProviderHostedTool)) {
  throw new Error(
    "LangGraph export does not support provider-hosted tools"
  );
}
```

Do not silently drop the tool from generated Python because the export target
has no equivalent execution/output contract.

- [ ] **Step 11: Verify integration safeguards**

Run:

```bash
bun test packages/core/src/server/storage/local/file-system.test.ts packages/core/src/thread/run-history-utils.test.ts packages/core/src/generator/langgraph/context-export.test.ts packages/core/src/generator/langgraph/index.test.ts apps/desktop/src/bun/rpc/stream-thread-request.test.ts apps/desktop/src/client/rpc-transport.test.ts
```

Expected: exit 0; storage is lossless, run summaries remain meaningful, RPC fixtures satisfy the wire contract, and LangGraph export writes zero files before reporting the unsupported feature.

- [ ] **Step 12: Commit the integration safeguards and design record**

```bash
git add packages/core/src/server/storage packages/core/src/thread packages/core/src/generator/langgraph apps/desktop/src docs/superpowers
git commit -m "docs: finalize provider-hosted tools implementation"
```

### Task 5: Verify the end-to-end feature and patch lifecycle

**Files:**
- Verify: `package.json`
- Verify: `bun.lock`
- Verify: `patches/@earendil-works%2Fpi-ai@0.83.0.patch`
- Verify: `docs/superpowers/specs/2026-08-01-provider-hosted-tools-design.md`

- [ ] **Step 1: Run all automated gates from the repository root**

```bash
mise run test
mise run typecheck
mise run lint
bun --filter @llm-space/desktop build:view
```

Expected: all commands exit 0; Bun reports zero failed tests, TypeScript reports no errors, ESLint reports zero warnings and errors, and Vite completes the production renderer build.

- [ ] **Step 2: Verify the real desktop workflow in an isolated data root**

```bash
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/llm-space-XXXXXX")"
LLM_SPACE_HOME="$TMP_ROOT" mise run dev:cef
```

Expected in the desktop renderer:

1. Tools → Add → Add Provider-Hosted Tool opens a JSON editor seeded with `{ "type": "web_search" }`.
2. Additional nested fields survive save, edit, close, reopen, and thread reload unchanged.
3. With Auto run tools disabled, a successful provider-owned call still completes inside the model request.
4. Returned hosted activity and safe citations render read-only; no local Execute or approval control appears.
5. An unsupported provider/tool combination displays the provider error without silently removing the configuration.

- [ ] **Step 3: Audit the dependency patch before every pi-ai upgrade**

When changing the catalog version, first remove the old `patchedDependencies` entry and patch artifact, install the candidate version, and run the focused pi contract suite:

```bash
bun install
bun test packages/core/src/server/agent/pi-ai-native-tools.test.ts packages/core/src/server/agent/stream.test.ts packages/core/src/client/converters.test.ts packages/core/src/client/reducer.test.ts
```

Expected decision:

- If upstream provides equivalent raw hosted-tool input, output replay, activity, and annotation fields, delete the patch permanently and adapt only the local boundary names.
- If any contract test fails because upstream still lacks behavior, regenerate a patch named for the exact installed version, register that exact version in `patchedDependencies`, rerun `bun install`, and require the focused suite plus all automated gates to pass.

Do not send this patch upstream as a prerequisite for the LLM Space feature: upstream issue [earendil-works/pi#4955](https://github.com/earendil-works/pi/issues/4955) was closed with no current plan to support the same class of hosted-tool behavior.

- [ ] **Step 4: Run the final stale-name and patch audit**

```bash
rg -n "pi-ai@0\.82|response-api-native-tool-editor|native-tool-activity-list|ResponseApiNativeToolConfig|isResponseApiNativeTool" docs/superpowers --glob '!docs/superpowers/plans/2026-08-01-provider-hosted-tools.md'
rg -n "response-api-native|nativeToolActivities" packages apps docs/superpowers patches
git diff --check
```

Expected: the first command returns no matches; the second returns matches only in legacy migration tests/code, the pi adapter boundary, the pi patch, and the design explanation; `git diff --check` exits 0.

## Final review checklist

- [ ] Product/UI/domain terminology consistently says Provider-Hosted Tool.
- [ ] `responseApiNativeTools` and `nativeToolActivities` appear only at the pi Responses adapter or legacy migration boundary.
- [ ] Tool objects preserve arbitrary JSON fields, while request-level fields are outside the editor.
- [ ] No provider/model capability preflight or tool-type whitelist was added.
- [ ] Provider-hosted execution is not governed by Auto run tools or the client ReAct executor.
- [ ] Response activities, raw output replay, sources, and citations survive persistence.
- [ ] OpenAI-compatible output behavior and DeepSeek transport routing are described without claiming unsupported provider capabilities.
- [ ] Provider-hosted MCP approval remains out of scope.
- [ ] The pi-ai 0.83.0 patch is exact-version registered and has an explicit upgrade/removal procedure.
- [ ] Full tests, typecheck, lint, production renderer build, and real desktop checks pass.
