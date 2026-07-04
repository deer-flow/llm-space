# LLM Space Capability Map

- Last updated: 2026-07-04
- Map status: updated after Thread Editor Reliability V1; first-thread editing is no longer blocked by the CEF CodeMirror crash, and MCP remains intentionally tools-only for the current product stage.
- Evidence rule: entries marked `confirmed` cite current rendered-product or current-code evidence. Entries marked `stale` rely on previous logs or code paths not fully re-inspected in this loop. Entries marked `unknown` need a future product-surface check before they can drive a recommendation.

## First-Run Model Setup

- Status: shipped V1
- Freshness: confirmed
- Last checked: 2026-07-03
- Evidence:
  - Current discovery screenshot `audits/2026-07-03-223500-trace-inspector-discovery/01-current-fresh-first-run.png` shows onboarding with a locally detected `OpenAI Codex` provider.
  - Current CEF snapshot showed clicking the detected provider transitions onboarding to `OpenAI Codex is ready` and `Ready to run`.
  - `apps/desktop/src/components/onboard-dialog.tsx` fetches builtin provider discovery and adds detected providers through existing model hooks.
- Boundary: first launch with no configured provider can detect local credentials, add a provider, and reach a runnable model without entering Settings first.
- Explicit non-goals: no real provider connectivity test, no quota/API test run, no setup wizard state machine, no secret display.
- Visible gaps: no real provider connectivity test after setup.

## Workspace And Thread Management

- Status: operational
- Freshness: confirmed
- Last checked: 2026-07-03
- Evidence:
  - Current discovery screenshot `01-current-fresh-first-run.png` shows an empty workspace state with `Start from Example`, `Blank thread`, and `Configure models`.
  - Current CEF fixture check showed both `general-agent` and `trace-fixture` files in the sidebar after reload.
  - `apps/desktop/src/components/file-system-tree-view/use-file-system-tree.ts` creates quick files as local JSON threads.
  - `apps/desktop/src/components/thread-tabs/use-thread-tabs.ts` restores/open tabs and defaults first-run tabs through persisted tab state.
- Boundary: local workspace tree, tabs, rename/move/delete/duplicate/reveal, prompt-example/blank thread creation, and local JSON persistence.
- Explicit non-goals: cloud sync, cross-workspace projects, external file watching beyond current tree refresh behavior.
- Visible gaps: richer workspace project organization remains out of scope; external file writes require reload/refresh to appear.

## Prompt And Thread Building

- Status: manual builder with prompt examples
- Freshness: confirmed
- Last checked: 2026-07-04
- Evidence:
  - Current screenshot `02-starter-thread-current.png` shows `Start from Example` now opens a prompt-example chooser rather than directly creating a single starter thread.
  - Current screenshot `03-example-thread-opened.png` shows a `general-agent` prompt example opened with a populated system prompt, fallback model, and an empty user message.
  - Current CEF discovery screenshot `audits/2026-07-04-175331-next-capability-discovery/01-current-first-run.png` confirms the first-run surface still offers `Start from Example`, `Blank thread`, and `Configure models`.
  - Reliability verification screenshot `audits/2026-07-04-185729-thread-editor-reliability-v1/02-blank-thread-codemirror.png` shows a fresh blank thread open in CEF with real CodeMirror editors rather than a blank app.
  - Reliability verification screenshot `audits/2026-07-04-185729-thread-editor-reliability-v1/05-reload-persisted-editor.png` shows a persisted blank-thread message restored after reload.
  - Reliability verification screenshot `audits/2026-07-04-185729-thread-editor-reliability-v1/06-example-thread-edited.png` shows a prompt example with edited system prompt and user message.
  - `apps/desktop/src/components/start-from-example-dialog.tsx` exposes the chooser.
  - `apps/desktop/src/components/thread-playground/prompt/prompt-examples.ts` defines the available prompt examples and stable file stems.
  - `apps/desktop/src/components/thread-playground/thread-playground.tsx` resolves a fallback model and enables run when a model exists.
- Boundary: user can choose built-in prompt examples or blank threads, then manually edit model, tools, system prompt, and messages inside one thread file.
- Explicit non-goals: multi-file prompt projects, template marketplace, automated prompt optimization.
- Visible gaps: no guided task setup after choosing an example; no automated CEF regression smoke for first-thread editing yet.

## Thread Editor Reliability

- Status: shipped V1
- Freshness: confirmed
- Last checked: 2026-07-04
- Evidence:
  - Discovery on port `9351` reproduced the original blank-thread crash and CEF console later identified the root cause as duplicate `@codemirror/state` instances.
  - `apps/desktop/package.json` now declares `@codemirror/language`, `@codemirror/state`, and `@codemirror/view` as explicit desktop dependencies, and `apps/desktop/vite.config.ts` dedupes those identity-sensitive packages.
  - `apps/desktop/src/components/code-editor/extensions.ts` imports `EditorView` and `Extension` from the explicit CodeMirror packages instead of through the `@uiw/react-codemirror` re-export.
  - `apps/desktop/src/components/code-editor/index.tsx` now isolates CodeMirror render failures with a local error boundary and provides a textarea-style fallback with retry.
  - CEF verification on port `9352` with isolated runtime root showed a blank thread with 2 real CodeMirror editors, 0 fallback textareas, a persisted user-message edit in `workspace/untitled.json`, successful reload restore, and an edited `general-agent` example persisted in `workspace/general-agent.json`.
  - Vite's rebuilt dependency cache no longer references `@codemirror/state@6.6.0`, `@codemirror/view@6.43.1`, or `@codemirror/language@6.12.3`; it resolves to `state@6.7.0`, `view@6.43.5`, and `language@6.12.4`.
- Boundary: users need to open blank/example threads, see existing text, type into message/system/tool editors, persist edits, and recover from editor-render failures without losing the rest of the app.
- Explicit non-goals: no full editor replacement, no new thread JSON schema, no analytics/crash-reporting service, no broad CodeMirror redesign.
- Visible gaps: fallback recovery was reviewed in code but not triggered in the happy-path CEF run because the root cause is fixed; no automated CEF regression smoke or crash telemetry yet.

## Run And Streaming

- Status: shipped core loop
- Freshness: confirmed
- Last checked: 2026-07-04
- Evidence:
  - Current screenshots `03-example-thread-opened.png` and `06-restored-run-message-view.png` show `Run` enabled once a fallback model exists.
  - Current discovery screenshot `audits/2026-07-04-110944-core-capability-discovery/03-general-agent-open.png` shows the General Agent example ready to run with model, messages, and tool definitions.
  - `apps/desktop/src/components/thread-playground/stores/thread-store.ts` streams through `streamThread()`, folds reducer events into messages, and records completed runs.
  - `apps/desktop/src/components/thread-tabs/thread-tab-pane.tsx` wires a single Electrobun RPC transport into the active thread.
- Boundary: one thread can run against its selected or fallback model, stream assistant/tool output, abort, and persist completed state.
- Explicit non-goals: batch runs, scheduled runs, provider health validation.
- Visible gaps: the general run control is not specialized for paused tool calls; users must infer continuation from message-level run controls.

## Tool Step Orchestration

- Status: partial manual loop
- Freshness: confirmed
- Last checked: 2026-07-04
- Evidence:
  - Current discovery screenshot `audits/2026-07-04-110944-core-capability-discovery/03-general-agent-open.png` shows the General Agent example ships with tool definitions such as `web_search`, `web_fetch`, `bash`, `read`, `write`, and `edit`.
  - Current fixture screenshot `audits/2026-07-04-110944-core-capability-discovery/04-tool-step-fixture-after-run.png` shows a thread with an assistant tool call and editable `Response` field, but no product-level pending-tool state or explicit `Continue` action tied to completed tool outputs.
  - `packages/core/src/server/agent/stream.ts` converts all configured tools into step-by-step agent tools whose `execute()` returns an empty text result and `terminate: true`, so the app intentionally stops at tool calls rather than executing web, shell, or filesystem operations.
  - `packages/core/src/client/converters.ts` can lower assistant `toolCalls` plus their outputs into pi `toolResult` messages, so the underlying continuation path exists once a tool output is filled.
  - `apps/desktop/src/components/thread-playground/message/tool-call-list-item.tsx` lets users edit a tool response and invoke run from the assistant message, but the UI labels this as generic rerun rather than a safe, guided tool-result continuation.
- Boundary: users can define tool schemas, receive model tool calls as assistant messages, manually edit tool-call outputs, and technically continue by rerunning from that assistant message.
- Explicit non-goals: no automatic web/search/shell/filesystem execution, no MCP runtime, no permission system, no background tool queue, no multi-agent runtime orchestration.
- Visible gaps: no first-class pending-tool status, no clear instruction that the app is waiting for tool output, no `Continue` CTA after outputs are supplied, no validation that all visible tool calls have non-empty outputs before continuing, and no safe local execution sandbox.

## MCP Server Integration

- Status: shipped V1
- Freshness: confirmed
- Last checked: 2026-07-04
- Evidence:
  - Implementation screenshot `audits/2026-07-04-122756-mcp-integration-v1/01-settings-mcp-empty.png` shows Settings now has an `MCP` page and empty server state.
  - Implementation screenshot `audits/2026-07-04-122756-mcp-integration-v1/02-settings-mcp-fixture-tools.png` shows a configured stdio fixture server tested through Settings with one discovered tool, `mcp__fixture__echo`.
  - Implementation screenshot `audits/2026-07-04-122756-mcp-integration-v1/03-thread-mcp-tool-added.png` shows the thread Tools area can add `mcp__fixture__echo` from the configured MCP server.
  - Implementation screenshot `audits/2026-07-04-122756-mcp-integration-v1/04-call-mcp-tool-result.png` shows an assistant MCP tool call exposes `Call MCP Tool` and fills the response with `fixture:cef`.
  - `apps/desktop/src/bun/mcp/mcp-manager.ts` persists `settings/mcp.json`, manages MCP clients in the Bun process, supports `StdioClientTransport`, `StreamableHTTPClientTransport`, and `SSEClientTransport`, lists tools, calls tools, normalizes direct names, and flattens tool results to text.
  - `apps/desktop/src/shared/rpc.ts` and `apps/desktop/src/bun/rpc/index.ts` expose typed MCP server/tool/call requests across the renderer/Bun boundary.
  - `packages/core/src/types/tools/index.ts` stores optional MCP provenance on function tools while preserving plain function tools.
  - Manager fixture verification discovered `mcp__fixture__echo` and returned `fixture:ok`; rendered CEF verification returned `fixture:cef`.
  - Readiness audit screenshot `audits/2026-07-04-151659-mcp-tool-readiness-v1/01-settings-ready-tools-current.png` shows Settings > MCP presenting Ready status, tool count, tested time, and live-session connection state after an explicit Test.
  - Readiness audit screenshot `audits/2026-07-04-151659-mcp-tool-readiness-v1/02-after-restart-last-test-current.png` shows the last tested status and tool summaries persist after an app restart without automatically reconnecting the MCP server.
  - Readiness audit screenshot `audits/2026-07-04-151659-mcp-tool-readiness-v1/03-add-mcp-readiness-popover-current.png` shows the thread `Add MCP` popover using persisted readiness/tool summaries with an explicit refresh and `Open Settings` path.
  - Readiness audit screenshot `audits/2026-07-04-151659-mcp-tool-readiness-v1/04-error-state-current.png` shows a readable failed readiness state for a missing environment variable.
  - `apps/desktop/src/bun/mcp/mcp-manager.ts` persists readiness snapshots in `settings/mcp.json`, including status, tested time, redacted latest error, tool count, and compact tool summaries.
- Boundary: users can configure MCP servers in local settings, with stdio, Streamable HTTP, or SSE transport fields; discover MCP tools; inspect persisted readiness status and last-known tool summaries; explicitly refresh/test a server; explicitly add selected tools to a thread as `mcp__{server_name}__{tool_name}` direct tools; and explicitly execute visible assistant MCP tool calls after a click, writing flattened text output into the existing tool-response field.
- Explicit non-goals: no full built-in OAuth authorization-code callback, token refresh, revoke, or account-management flow; no resources browser; no prompts browser; no sampling, elicitation, or tasks; no automatic MCP execution during agent streaming; no MCP registry browsing; no global permission policy beyond explicit per-call user action.
- Visible gaps: Streamable HTTP/SSE code paths and settings fields are implemented but were not audited against a real authenticated remote MCP service; readiness stores a last-known snapshot rather than a background health monitor; MCP outputs are flattened to text rather than preserving rich resource/blob payloads; threads must add MCP tools explicitly one by one; direct tool names are disabled rather than auto-suffixed when normalized MCP tool names collide. Resources/prompts are an intentional near-term non-goal because expected usage is low for the current product stage.

## MCP Context Primitives

- Status: deferred/non-goal for current stage
- Freshness: confirmed
- Last checked: 2026-07-04
- Evidence:
  - Current discovery screenshot `audits/2026-07-04-142708-mcp-next-discovery/01-settings-mcp-empty.png` shows the Settings > MCP surface has server management only; no resources or prompts section is present.
  - Current discovery screenshots `audits/2026-07-04-142708-mcp-next-discovery/02-blank-thread-add-mcp-entry.png` and `03-add-mcp-no-servers.png` show the thread-level MCP entry is scoped to adding MCP tools, not browsing or inserting context/prompt primitives.
  - `apps/desktop/src/bun/mcp/mcp-manager.ts` currently implements `listTools()` and `callTool()` but no `listResources()`, `readResource()`, `listPrompts()`, or `getPrompt()` path.
  - `apps/desktop/src/shared/rpc.ts` exposes MCP server CRUD, tool listing, and tool calls only.
  - `apps/desktop/node_modules/@modelcontextprotocol/sdk/README.md` confirms the installed SDK exposes high-level client helpers for tools, resources, and prompts.
- Boundary: users cannot discover MCP resources, read text resources, discover MCP prompt templates, provide prompt arguments, preview prompt messages, or insert MCP-provided context into a thread.
- Explicit non-goals: no automatic context inclusion, no resource subscriptions/templates, no binary/resource gallery, no MCP sampling, elicitation, tasks, apps, or full OAuth account lifecycle.
- Visible gaps: all user-facing resource and prompt flows are absent, but this is no longer treated as the next priority. Product decision on 2026-07-04: keep MCP tool-only for now because resources/prompts exist in the protocol but appear rarely used in practice.

## Debug Timeline

- Status: shipped V1 with inspection entry points
- Freshness: confirmed
- Last checked: 2026-07-03
- Evidence:
  - Current screenshot `04-trace-fixture-run-history.png` shows two durable run snapshots listed in the Run history panel.
  - Current screenshot `06-restored-run-message-view.png` shows restoring a run displays assistant thinking and tool call outputs in the main message editor.
  - Implementation audit screenshot `audits/2026-07-03-225143-trace-inspector-v1/02-run-history-open.png` shows run-history rows with compare, inspect, and restore actions visible inside the right panel at 1280x800.
  - `apps/desktop/src/components/thread-playground/run-history-list-view.tsx` renders run history, inspect controls, restore controls, removal, comparison selection, and saved evaluation cards.
- Boundary: recent completed runs are recorded per thread, listed in the Run history panel, inspectable without mutation, and restorable into the editor when the user intentionally wants an editable snapshot.
- Explicit non-goals: full raw trace event persistence, step-through trace inspector, global run database.
- Visible gaps: restore still intentionally mutates the working thread; raw event timing and step-through playback remain out of scope.

## Evaluation Workspace

- Status: shipped V1
- Freshness: confirmed
- Last checked: 2026-07-03
- Evidence:
  - Current screenshot `04-trace-fixture-run-history.png` shows a saved evaluation card for two runs.
  - Current screenshot `05-current-evaluation-dialog.png` shows the evaluation dialog comparing two run snapshots with model/message metadata, system prompt, last user message, result text, tool inputs, and tool outputs.
  - Implementation audit screenshots `04-evaluation-dialog-with-inspect.png` and `06-inspector-inside-evaluation.png` show each comparison side can open a read-only inspector inside the saved evaluation dialog without stacking a second modal.
  - `packages/core/src/types/threads/thread.ts` includes optional `evaluations`.
  - `apps/desktop/src/components/thread-playground/run-evaluation-dialog.tsx` renders the manual verdict/note comparison dialog.
- Boundary: two durable run snapshots in one thread can be compared manually, inspected individually, labeled with a verdict, annotated, and persisted with the thread.
- Explicit non-goals: dataset runner, automated judge, global evaluation database, reusable rubrics.
- Visible gaps: no side-by-side trace diff, reusable rubric, dataset runner, or automated judge.

## Trace Inspection

- Status: shipped V1
- Freshness: confirmed
- Last checked: 2026-07-03
- Evidence:
  - README promises Trace as a top-level product capability.
  - Current screenshot `05-current-evaluation-dialog.png` shows evaluation can display compact tool input/output text, but not thinking or a chronological evidence path.
  - Current screenshot `06-restored-run-message-view.png` shows the main editor can display assistant thinking and tool call outputs only after a run is restored.
  - Implementation audit screenshot `03-inspector-from-run-history.png` shows a read-only run inspector opened from Run history with system prompt, last user message, assistant result, thinking, and ordered tool calls.
  - Implementation audit screenshot `06-inspector-inside-evaluation.png` shows the same inspector opened from a saved evaluation run side inside one dialog layer, including a clear `No thinking captured` empty state.
  - `apps/desktop/src/components/thread-playground/run-trace-dialog.tsx` renders the inspector from existing `RunSnapshot` data.
  - `apps/desktop/src/components/thread-playground/run-history-list-view.tsx` and `apps/desktop/src/components/thread-playground/run-evaluation-dialog.tsx` wire the inspect actions.
  - `packages/core/src/client/reducer.ts` reduces stream events into final assistant messages with `thinking` and `toolCalls`, but raw event timings are not persisted.
  - `packages/core/src/types/threads/thread.ts` persists run snapshots as reduced thread snapshots, not raw event timelines.
- Boundary: users can inspect reduced saved-run evidence non-destructively from Run history or either side of an Evaluation dialog, including prompt, last user message, final assistant result, thinking, tool inputs, and tool outputs.
- Explicit non-goals: raw token/event timeline, per-step latency, global trace database, side-by-side step diff, automated diagnosis.
- Visible gaps: V1 is limited to reduced run snapshots; it does not preserve exact event timing, token deltas, intermediate stream chronology, or cross-run trace diffs.

## Model Settings And Provider Management

- Status: operational settings surface
- Freshness: confirmed
- Last checked: 2026-07-03
- Evidence:
  - Current first-run CEF flow added `OpenAI Codex` through onboarding and persisted provider settings in the isolated root.
  - Previous log `logs/2026-07-02-195244-first-run-model-setup-v1.md` verified provider add/persist flows through onboarding and settings.
  - `apps/desktop/src/components/settings/models-page.tsx` owns provider/model CRUD UI.
- Boundary: manage builtin/custom providers and enabled models through local settings.
- Explicit non-goals: account management, cloud sync, provider billing/quota checks.
- Visible gaps: no V1 connectivity validation after a provider is configured.
