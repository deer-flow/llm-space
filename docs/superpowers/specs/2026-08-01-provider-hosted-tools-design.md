# Provider-Hosted Tools Design

**Status:** Implemented. See the execution and verification sequence in
[`../plans/2026-08-01-provider-hosted-tools.md`](../plans/2026-08-01-provider-hosted-tools.md).

## Summary

LLM Space lets users add raw provider-hosted tool configuration beside its
built-in, MCP, and custom function tool choices. A provider-hosted tool is a
JSON object such as `{ "type": "web_search" }` that is persisted with the
thread. Its complete JSON object is appended unchanged to the selected model
service's tool payload; field meaning and support remain provider-specific.

The provider owns execution inside the model request. LLM Space does not run
these tools locally, and `Auto run tools`, approval settings, and the outer
ReAct loop do not control them. When a provider returns hosted-tool output,
LLM Space preserves and renders the activity, sources, and text citations.

The feature deliberately does not maintain a provider/model capability matrix
or preflight a tool definition. Provider validation remains authoritative; an
unsupported definition is surfaced as the provider error.

## Terminology and layering

- Product and domain language: **Provider-Hosted Tool**.
- Persisted/runtime domain names: `ProviderHostedTool`,
  `ProviderHostedToolConfig`, `providerHostedToolActivities`, and the
  `provider-hosted` discriminant.
- pi-ai Responses adapter boundary: `responseApiNativeTools` and
  `nativeToolActivities`. These names are retained because they are fields in
  the patched `@earendil-works/pi-ai` contract, not product concepts.
- Legacy compatibility: thread files written by the earlier feature branch
  with `response-api-native` or `nativeToolActivities` are accepted and
  normalized, including messages inside `runHistory` snapshots.

This distinction keeps the UI provider-neutral without disguising the concrete
Responses protocol implemented at the dependency boundary.

## Goals

- Add an `Add Provider-Hosted Tool` menu choice beside
  `Add Custom Function Tool`.
- Let users create and edit the complete tool JSON.
- Validate only the portable shape needed for safe transport.
- Preserve unknown fields and unknown hosted-tool types verbatim.
- Keep provider-hosted tools out of local execution, approval, Auto run, and
  ReAct continuation paths.
- Persist and display hosted activity output, including web-search citations.
- Preserve raw provider output when a normalized field is unavailable.

## Non-goals

- Discovering or verifying model-specific hosted-tool support.
- Maintaining a whitelist of supported providers, models, tool types, or
  tool-specific parameters.
- Converting a provider-hosted tool into a function, MCP, or built-in tool.
- Falling back automatically to LLM Space's built-in `web_search`.
- Implementing provider-hosted MCP approval flows.
- Replacing `pi-agent-core` or changing the outer ReAct loop protocol.

## User-facing semantics

The Tools add menu includes:

```text
Add Built-in Tools
Add MCP Tools
------------------
Add Provider-Hosted Tool
Add Custom Function Tool
```

The editor starts with:

```json
{
  "type": "web_search"
}
```

Users may add tool-specific JSON fields, for example:

```json
{
  "type": "web_search",
  "search_context_size": "high",
  "user_location": {
    "type": "approximate",
    "country": "CN"
  }
}
```

Fields beyond `type` may contain any JSON value and are passed unchanged. For
example, one service may accept `search_context_size` for `web_search`, while
another hosted tool may require identifiers, filters, approval settings, or
other tool-specific data. LLM Space validates the generic envelope, not
whether a specific provider, model, or tool type supports each field.

The editor configures one object inside the request's `tools` array. Request-
level controls such as `tool_choice`, `include`, `reasoning`, and `background`
are not fields of that tool object and are not configured in this editor.
Placing them inside the JSON does not configure the corresponding top-level
request option; the provider may instead reject them as unknown tool fields.

## Domain model

```ts
interface ProviderHostedTool {
  type: "provider-hosted";
  config: {
    type: string;
    [key: string]: JsonValue;
  };
}
```

`config.type` identifies the provider tool and every other JSON field is
preserved. The parser requires an object, a non-empty string `type`, JSON-only
values, and rejects `function` and `custom`, whose outputs require client-side
tool results. Stable identity is `provider-hosted:${config.type}`.

The thread Zod boundary normalizes the earlier `response-api-native`
discriminant before validation. Runtime normalization provides the same
compatibility for already-constructed thread objects.

## Runtime architecture

`convertToPiContext()` partitions tools by execution ownership:

```ts
interface PiThreadContext {
  systemPrompt?: string;
  messages: pi.Message[];
  tools: pi.Tool[];
  responseApiNativeTools: ProviderHostedToolConfig[];
}
```

Function, MCP, and built-in tools enter `tools`. Provider-hosted configurations
are copied without field rewriting into the pi-facing
`responseApiNativeTools` channel. Consequently, `pi-agent-core` cannot execute
them locally or use them to continue the client ReAct loop.

`streamAgent()` appends these raw configurations to the adapter's final tool
payload. It does so whenever the thread has a provider-hosted tool: delivery is
not gated by `model.api`, provider metadata, a capability flag, or a local
support matrix. The adapter/provider may accept or reject the result.

### Execution ownership

Provider-hosted execution happens inside the model service's request. The
service may internally perform one or more hosted calls before it completes the
response; those calls are response data, not interruptions asking LLM Space to
execute a tool.

The outer `pi-agent-core` ReAct loop sees only client function, MCP, and built-in
tools. Therefore `Auto run tools`, the local executable-tool predicate, manual
tool-result entry, and local approval controls neither start nor stop a
provider-hosted call. This separation also prevents provider output such as
`web_search_call` from causing an extra client-side ReAct continuation.

## pi-ai patch boundary

The locked `@earendil-works/pi-ai@0.83.0` release does not expose the required
hosted-tool input and Responses output metadata, so LLM Space carries the
exact-version Bun patch
`patches/@earendil-works%2Fpi-ai@0.83.0.patch`. The patch:

- accepts `responseApiNativeTools` on the pi streaming boundary;
- appends raw definitions to Responses request `params.tools`;
- preserves terminal Responses output for stateless replay; and
- exposes pi assistant `nativeToolActivities` and response annotations.

Those dependency field names remain unchanged. LLM Space maps them to and from
the provider-hosted domain at `converters.ts` and `reducer.ts`. A similar
upstream request, [earendil-works/pi#4955](https://github.com/earendil-works/pi/issues/4955),
was closed with no current plan to support this class of behavior, so this
feature does not wait on a separate pi pull request.

Every pi-ai upgrade must re-evaluate the patch rather than carrying it forward
blindly:

1. Install the candidate dependency without the old patch registration.
2. Run the direct pi contract, runtime payload, converter, and reducer tests.
3. Delete the patch if upstream now provides equivalent raw input, terminal
   output replay, activity, and annotation contracts.
4. Otherwise regenerate the patch against the exact installed version, update
   `patchedDependencies`, run `bun install`, and rerun focused plus full gates.

## Response normalization and persistence

The pi adapter collects non-client Responses output items such as
`web_search_call`. Complete raw items are retained and common fields are
normalized when available. `responseOutputItems` preserves terminal provider
order for later stateless replay.

At the boundary, pi's `nativeToolActivities` becomes LLM Space's
`providerHostedToolActivities`. Assistant text annotations and
`responseOutputItems` are persisted with the thread. Replaying a saved thread
maps the activity field back to pi's dependency contract without creating a
local `ToolCall` or `ToolResultMessage`.

Legacy `nativeToolActivities` fields are normalized in both current messages
and nested run-history snapshots before thread validation/persistence. The
earlier `response-api-native` discriminant is likewise rewritten to
`provider-hosted`. Canonical fields win if old and new activity keys coexist,
and new saves contain only canonical domain names.

## Provider-specific behavior

- OpenAI GPT models configured with the `openai-responses` adapter can receive
  provider-hosted definitions through a Responses-compatible request. The
  patch understands Responses output items such as `web_search_call`, but this
  does not mean every GPT model supports every hosted tool type or parameter.
- `deepseek-v4-flash` is registered locally with the `openai-responses`
  transport. That is a transport decision only; it does not claim that the
  DeepSeek service supports OpenAI's hosted `web_search`, accepts identical
  tool fields, or returns every OpenAI output shape.
- Other adapters receive the raw object in their provider-specific tool-payload
  location. Successful behavior depends entirely on that model service; an
  unsupported object or field is expected to fail with its provider error.

LLM Space deliberately does not infer capabilities from a provider name, a
model id, or Responses transport selection. This keeps stored configurations
portable while avoiding false claims about OpenAI, DeepSeek, or compatible
third-party services.

## Presentation

- A configured provider-hosted tool uses a cloud icon, displays `config.type`,
  and shows its complete formatted JSON in the tooltip.
- Its editor explains that the provider runs the tool inside the model request
  and that Auto run tools does not control it.
- Assistant activities render a compact status/source view with expandable raw
  JSON. Unknown activity types use the same generic representation.
- URL citations use the existing safe external-link behavior.
- Provider-hosted activities never render a local execution button or a
  missing-result state.
- Text citations render as a safe source list below the completed answer.
  Citation annotations are deliberately not installed as CodeMirror
  decorations: the message editor is the streaming hot path, and changing its
  extension configuration on preview updates forces expensive editor
  reconfiguration.

## Error handling

- Invalid JSON or generic shape: keep the editor open and show an actionable
  validation message.
- Unsupported tool type or parameter: surface the provider error without
  retrying or silently removing the configuration.
- Unknown output item: preserve it as a generic activity.
- Provider-hosted MCP approval request: preserve/display returned data when
  possible, but do not start an interactive approval flow; that workflow is
  explicitly outside this feature.
- LangGraph export: fail explicitly because the generated Python runtime does
  not share the TypeScript adapter.

## Test strategy

Required coverage includes:

1. Parsing preserves arbitrary JSON fields such as `search_context_size` and
   `user_location` and rejects invalid generic shapes.
2. New threads round-trip the `provider-hosted` discriminant and
   `providerHostedToolActivities`.
3. Legacy current and run-history data normalizes before Zod validation.
4. `convertToPiContext()` separates local tools and forwards the complete raw
   configuration through `responseApiNativeTools`.
5. The reducer maps pi's `nativeToolActivities` into the domain field.
6. Provider output, response replay metadata, citations, and generic activity
   rendering remain intact.
7. Provider-hosted tools never enter local execution or ReAct continuation.
8. Full test, typecheck, lint, and build verification remains clean.

## References

- [OpenAI tools guide](https://developers.openai.com/api/docs/guides/tools)
- [OpenAI web search guide](https://developers.openai.com/api/docs/guides/tools-web-search)
- [OpenAI Responses API reference](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [DeepSeek Responses API guide](https://api-docs.deepseek.com/guides/responses_api/)
