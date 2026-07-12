# LLM Space Capability Map

- Last updated: 2026-07-11
- Map status: refreshed after DI/plugin-readiness V1. The Bun process now has one explicit composition root, deterministic bundled-module lifecycle, and one frozen built-in-tool contribution seam; public or dynamically loaded plugins remain absent.
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
- Last checked: 2026-07-08
- Evidence:
  - Discovery CEF screenshot `audits/2026-07-08-173643-system-prompt-variables/01-current-system-prompt-editor.png` showed the pre-V1 system prompt editor exposed `Generate` and `Examples`, but no Variables entry, variable picker, rendered-preview affordance, date token, or skill selector in the prompt surface.
  - Discovery CEF snapshot on 2026-07-08 showed system prompt editing, model/tool rows, message editing, and run history active with no horizontal overflow before this capability was added.
  - Implementation screenshot `audits/2026-07-08-173643-system-prompt-variables/03-variables-button-thread.png` shows a new `Variables` action beside `Generate` and `Examples`.
  - Implementation screenshot `audits/2026-07-08-173643-system-prompt-variables/04-variables-popover-skills.png` shows current-date format preview and enabled-skill selection/preview inside the variables popover.
  - Implementation screenshot `audits/2026-07-08-173643-system-prompt-variables/05-date-skill-inserted.png` shows date and selected-skill placeholders inserted into the system prompt editor.
  - Runtime resolver check in the live CEF/Vite page resolved `{{llm_space.current_date format="default"}}` and `{{llm_space.skill name="deep-research" format="summary"}}` into concrete prompt text and returned an actionable error for a missing skill.
  - Variable Panel V2 screenshot `audits/2026-07-08-191806-variable-panel-v2/07-v2-skills-markdown-indent.png` shows simple placeholders in the editor while selected skills, `markdown-list` format, and `2 spaces` indentation live in the panel.
  - Variable Panel V2 screenshot `audits/2026-07-08-191806-variable-panel-v2/06-v2-custom-scenario.png` shows custom variable `customer_profile` under active scenario `scenario_2` with a multiline value.
  - Isolated runtime file `workspace/untitled-3.json` persisted `context.variables.available_skills` with `skillNames`, `format`, and `indent`, plus `context.variableVariants` with `baseline` and `scenario_2` value sets.
  - Live CEF resolver checks rendered `{{available_skills}}`, `{{customer_profile}}`, and `{{system_date}}`, and rejected legacy `{{llm_space.current_date format="default"}}`, empty skill selections, and empty custom values with actionable errors.
  - `apps/desktop/src/components/thread-playground/prompt-variables.ts` formats date and skill variables, loads enabled skills through existing skill settings, and resolves placeholders.
  - `apps/desktop/src/components/thread-playground/stores/thread-store.ts` now renders variables before `streamThread()` while run snapshots keep the rendered prompt and the live editor keeps the template.
  - Current screenshot `02-starter-thread-current.png` shows `Start from Example` now opens a prompt-example chooser rather than directly creating a single starter thread.
  - Current screenshot `03-example-thread-opened.png` shows a `general-agent` prompt example opened with a populated system prompt, fallback model, and an empty user message.
  - Current CEF discovery screenshot `audits/2026-07-04-175331-next-capability-discovery/01-current-first-run.png` confirms the first-run surface still offers `Start from Example`, `Blank thread`, and `Configure models`.
  - Reliability verification screenshot `audits/2026-07-04-185729-thread-editor-reliability-v1/02-blank-thread-codemirror.png` shows a fresh blank thread open in CEF with real CodeMirror editors rather than a blank app.
  - Reliability verification screenshot `audits/2026-07-04-185729-thread-editor-reliability-v1/05-reload-persisted-editor.png` shows a persisted blank-thread message restored after reload.
  - Reliability verification screenshot `audits/2026-07-04-185729-thread-editor-reliability-v1/06-example-thread-edited.png` shows a prompt example with edited system prompt and user message.
  - `apps/desktop/src/components/start-from-example-dialog.tsx` exposes the chooser.
  - `apps/desktop/src/components/thread-playground/prompt/prompt-examples.ts` defines the available prompt examples and stable file stems.
  - `apps/desktop/src/components/thread-playground/thread-playground.tsx` resolves a fallback model and enables run when a model exists.
- Boundary: user can choose built-in prompt examples or blank threads, manually edit model/tools/system prompt/messages, manage thread-owned prompt variables from a dedicated Variables row below Tools, configure current date and selected skill groups, add default custom variable values, preview formatted values in the Variables dialog, type simple `{{variable_name}}` placeholders into the system prompt, and run with those variables resolved while keeping the stored system prompt as a reusable template.
- Explicit non-goals: multi-file prompt projects, template marketplace, automated prompt optimization.
- Visible gaps: no smart spacing between consecutive inserted placeholders, no dedicated rendered-vs-template diff panel, no full keyboard/screen-reader audit for the variables panel, no guided task setup after choosing an example, and no automated CEF regression smoke for first-thread editing yet.

## System Prompt Variables

- Status: shipped V3 with dedicated Variables row and dialog
- Freshness: confirmed
- Last checked: 2026-07-09
- Evidence:
  - Discovery CEF screenshot `audits/2026-07-08-173643-system-prompt-variables/01-current-system-prompt-editor.png` confirmed the original prompt editor gap: no Variables affordance beside `Generate` and `Examples`.
  - Source inspection confirmed skill discovery and runtime loading already existed through Settings/RPC and the built-in `skill()` tool, so V1 reused existing enabled-skill data instead of introducing a new discovery model.
  - Implementation screenshot `audits/2026-07-08-173643-system-prompt-variables/03-variables-button-thread.png` shows `Variables` in the system prompt toolbar.
  - Implementation screenshot `audits/2026-07-08-173643-system-prompt-variables/04-variables-popover-skills.png` shows date and skill variable formats with previews.
  - Implementation screenshot `audits/2026-07-08-173643-system-prompt-variables/05-date-skill-inserted.png` shows durable date and skill placeholders inserted into the prompt editor.
  - `workspace/untitled.json` in the isolated CEF runtime persisted the placeholder template.
  - Focused resolver checks in the live CEF/Vite page confirmed concrete date/skill rendering and missing-skill errors.
  - V2 screenshot `audits/2026-07-08-191806-variable-panel-v2/07-v2-skills-markdown-indent.png` shows the persistent Variables panel below the editor with `available_skills`, selected `deep-research`, `markdown-list`, and `2 spaces`.
  - V2 screenshot `audits/2026-07-08-191806-variable-panel-v2/06-v2-custom-scenario.png` shows active scenario `scenario_2` and custom multiline variable `customer_profile`.
  - V2 isolated runtime file `workspace/untitled-3.json` persisted `context.variables` and `context.variableVariants`:
    - `available_skills`: `skillNames: ["deep-research"]`, `format: "markdown-list"`, `indent: 2`
    - `system_date`: `type: "currentDate"`, `format: "readable-date"`
    - `variableVariants.active: "scenario_2"` with `baseline` and `scenario_2` value sets.
  - Live CEF resolver checks rendered simple placeholders and returned blocking errors for legacy `llm_space.*` expressions, missing skills, and empty custom values.
  - Layout polish screenshot `audits/2026-07-08-220831-variable-panel-redesign/03-final-skills-detail.png` shows the Variables panel as a resizable section under the system prompt editor with a full-width header divider, compact rows, and a selected-row detail editor.
  - CEF drag verification on port `9333` moved the horizontal resize handle and changed the Variables panel from `243.39px` to `333.39px` without horizontal overflow.
  - Initial relocation screenshot `audits/2026-07-09-101033-variables-tools-entry/02-tools-row-variables-entry.png` showed `Variables` as a compact entry inside the Tools row; UI review corrected this to a separate row.
  - Correction screenshot `audits/2026-07-09-101033-variables-tools-entry/06-variables-separate-row.png` shows a dedicated `Variables` row below `Tools`, with `current_date` and `available_skills` visible as chips plus `Add`.
  - Correction screenshot `audits/2026-07-09-101033-variables-tools-entry/07-variable-chip-opens-detail.png` shows clicking `available_skills` opens the Variables dialog focused on the Skills detail.
  - CEF DOM checks on 2026-07-09 confirmed the row order `Tools` -> `Variables` -> `System prompt`, `documentElement.scrollWidth - innerWidth === 0`, and `0` visible `Insert` buttons.
  - Dialog screenshot `audits/2026-07-09-101033-variables-tools-entry/03-variables-dialog.png` shows the Variables management dialog reusing the variable list and selected-detail layout.
  - Skill-preview screenshot `audits/2026-07-09-101033-variables-tools-entry/05-skills-preview.png` shows the skills detail using `Add` to open skill selection and previewing the selected `deep-research` skill.
  - CEF DOM checks on 2026-07-09 found `0` visible `Insert` buttons in the Variables flow, `documentElement.scrollWidth - innerWidth === 0`, and no relevant console errors.
  - Isolated runtime file `workspace/untitled.json` persisted `context.variables.available_skills.skillNames = ["deep-research"]` and `context.variableVariants.variants.default.custom_variable = ""` after editing through the dialog.
  - Product-design audit notes `audits/2026-07-09-101033-variables-tools-entry/audit-notes.md` found the entry relocation healthy, with keyboard/screen-reader QA as the main remaining risk.
  - TypeScript, lint, diff check, console, and overflow checks passed for the implementation.
- Boundary: users can scan variables directly in a dedicated Variables row below Tools; click a variable chip to open the dialog focused on that variable; use `Add` to open the same dialog for management; rename/configure built-in current-date and skills variables; select an ordered group of enabled skills; choose `xml` or `markdown-list` skills format plus skills-only indentation; add default custom variables; persist all variable config in the thread; type simple `{{variable_name}}` placeholders in the system prompt; and render those variables before the model call. Saved run snapshots preserve the template system prompt rather than replacing it with rendered text.
- Explicit non-goals: no broad templating language, no prompt marketplace, no automatic skill invocation, no secret/env-variable interpolation, no background skill indexing beyond current discovery folders.
- Visible gaps: no direct variable Insert shortcut in the current dialog, no smart whitespace/newline insertion between consecutive placeholders, no rendered-template diff UI, no full accessibility audit beyond DOM labels/screenshot review, and no paid-provider smoke run in this loop.

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
- Visible gaps: live-provider continuation after a real paid/provider tool-call turn still needs a bounded smoke check; the global run control remains generic while the message-level continuation flow is specialized.

## Token Usage Visibility

- Status: shipped V1
- Freshness: confirmed
- Last checked: 2026-07-05
- Evidence:
  - Current discovery screenshot `audits/2026-07-05-002359-token-usage-discovery/01-current-first-run.png` shows the first-run/product surface is healthy enough to inspect.
  - Current discovery screenshot `audits/2026-07-05-002359-token-usage-discovery/02-example-run-history-no-usage.png` shows the thread editor and Run history panel expose model, messages, and run-history controls, but no token/cost counters or per-step usage summary.
  - `node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js` emits `message_end` with the provider's final assistant message, including `usage`.
  - `node_modules/@earendil-works/pi-ai/dist/types.d.ts` defines provider `Usage` with input, output, cache read/write, reasoning, total tokens, and cost fields.
  - `packages/core/src/client/reducer.ts` now copies non-empty provider usage from `message_end` into the final assistant message.
  - `packages/core/src/types/messages/usage.ts` and `messages.ts` define a backwards-compatible optional assistant-message `usage` field.
  - `packages/core/src/client/converters.ts` preserves saved assistant usage when replaying context to pi.
  - `apps/desktop/src/components/thread-playground/message/token-usage-summary.tsx` renders compact per-step token/cost chips with tooltip breakdowns.
  - `apps/desktop/src/components/thread-playground/token-usage.ts` formats provider usage, aggregates assistant-step usage, and falls back to old snapshot aggregation only when older saved runs lack their own `usage`.
  - Implementation screenshots `audits/2026-07-05-002359-token-usage-visibility-v1/02-token-usage-thread-open.png`, `06-run-history-layout-fixed.png`, `07-run-trace-visible.png`, and `04-token-usage-after-reload.png` show per-step usage, run/trace usage, and reload persistence in the real CEF renderer.
  - Follow-up screenshot `audits/2026-07-05-002359-token-usage-visibility-v1/08-token-usage-header-cache.png` and DOM checks on port `9362` show assistant usage chips in the same header row as `Assistant`, with cache read shown as `cached` and cache write shown as `cache write`.
  - Review-fix screenshots `audits/2026-07-05-002359-token-usage-visibility-v1/10-review-fix-run-history-open.png` and `11-review-fix-run-trace.png`, plus DOM checks on port `9363`, confirm Run history and trace headers use saved-run `usage` deltas (`210 tok ...`) rather than cumulative thread totals, include input/output/reasoning/cache/cost, omit `Cache Write 1h`, and keep `documentElement.scrollWidth === innerWidth` at 1280px.
- Boundary: users can see and retain provider-reported token/cost/cache consumption per assistant/model step, per saved run, and inside the saved-run trace inspector. Per-run displays use the run's own usage delta when available, with best-effort old-file fallback to snapshot aggregation. Per-step usage appears in the assistant message header row. Missing or all-zero provider usage is intentionally omitted from the main editor.
- Explicit non-goals: no provider billing reconciliation, quota enforcement, usage dashboard across workspaces, token estimation before sending, alerts/budgets, or non-LLM tool runtime cost model.
- Visible gaps: no global usage dashboard, no context-window preflight, no evaluation cost-diff UI, no live paid-provider smoke in this loop, and no full keyboard/screen-reader audit of tooltip details yet.

## Tool Step Orchestration

- Status: shipped V1 manual loop
- Freshness: confirmed
- Last checked: 2026-07-04
- Evidence:
  - Current discovery screenshot `audits/2026-07-04-110944-core-capability-discovery/03-general-agent-open.png` shows the General Agent example ships with tool definitions such as `web_search`, `web_fetch`, `bash`, `read`, `write`, and `edit`.
  - Current fixture screenshot `audits/2026-07-04-110944-core-capability-discovery/04-tool-step-fixture-after-run.png` shows a thread with an assistant tool call and editable `Response` field, but no product-level pending-tool state or explicit `Continue` action tied to completed tool outputs.
  - Current discovery screenshot `audits/2026-07-04-224500-different-feature-discovery/04-tool-step-response-filled.png` shows a real CEF thread with a pending `web_search` tool call, a manually filled `Response`, and no visible `Continue`/pending-tool workflow beyond generic run controls.
  - Current CEF button/text inspection on 2026-07-04 showed `Run from this message` remains available on the assistant tool-call message, while no `Continue`, `Approve`, `Reject`, or all-tools-ready state appears after the tool response is supplied.
  - `packages/core/src/server/agent/stream.ts` converts all configured tools into step-by-step agent tools whose `execute()` returns an empty text result and `terminate: true`, so the app intentionally stops at tool calls rather than executing web, shell, or filesystem operations.
  - `packages/core/src/client/converters.ts` can lower assistant `toolCalls` plus their outputs into pi `toolResult` messages, so the underlying continuation path exists once a tool output is filled.
  - Manual Tool Continuation V1 screenshots `audits/2026-07-04-231420-manual-tool-continuation-v1/01-pending-needs-response.png`, `02-ready-continue-enabled.png`, `04-multi-one-missing.png`, and `05-error-result-ready.png` show pending, ready, multi-tool, and error-result continuation states in the real CEF renderer.
  - `apps/desktop/src/components/thread-playground/message/tool-call-status.ts` derives pending/ready/error summary state from existing `toolCall.output` data without changing the thread schema.
  - `apps/desktop/src/components/thread-playground/message/message-list-item.tsx` shows `Waiting for Tools` / `Tool Results Ready` and a message-level `Continue` CTA that calls the existing `run(message.id)` path.
  - `apps/desktop/src/components/thread-playground/message/tool-call-list-item.tsx` lets users mark or clear error results with the existing `isError` flag and keeps Cmd+Enter continuation gated until all tool calls have text output.
- Boundary: users can define tool schemas, receive model tool calls as assistant messages, manually edit tool-call outputs, mark failed/rejected results as error text, see all-tools-ready status, and continue from the assistant tool-call message once every visible tool call has output.
- Explicit non-goals: no automatic web/search/shell/filesystem execution, no MCP runtime, no permission system, no background tool queue, no multi-agent runtime orchestration.
- Visible gaps: live paid/provider continuation was not exercised in this loop; no automatic local execution sandbox, permission system, background queue, or rich multi-step trace timeline; error marking is a compact text toggle rather than a dedicated reject dialog.

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
  - Current discovery screenshot `audits/2026-07-04-202128-remote-mcp-diagnostics-discovery/03-settings-mcp-remote-form.png` confirms the MCP settings form exposes Streamable HTTP URL and headers.
  - Current discovery screenshot `audits/2026-07-04-202128-remote-mcp-diagnostics-discovery/04-remote-connection-error.png` shows an unreachable Streamable HTTP endpoint reports a generic connectivity error.
  - Current discovery screenshot `audits/2026-07-04-202128-remote-mcp-diagnostics-discovery/05-add-mcp-error-popover.png` shows the thread Add MCP popover carries the persisted remote error and retry/open-settings paths.
  - Remote diagnostics implementation screenshots `audits/2026-07-04-211429-remote-mcp-diagnostics-v1/01-settings-remote-success-diagnostics.png`, `02-settings-remote-auth-diagnostics.png`, and `03-settings-remote-env-diagnostics.png` show successful, unauthorized, and missing-env Streamable HTTP tests with redacted diagnostic timelines.
  - Remote diagnostics implementation screenshot `audits/2026-07-04-211429-remote-mcp-diagnostics-v1/04-add-mcp-diagnostic-headline.png` shows the thread Add MCP popover surfacing the latest diagnostic headline and Settings path.
- Boundary: users can configure MCP servers in local settings, with stdio, Streamable HTTP, or SSE transport fields; discover MCP tools; inspect persisted readiness status, last-known tool summaries, and latest redacted diagnostic timeline; explicitly refresh/test a server; copy a safe diagnostic summary; explicitly add selected tools to a thread as `mcp__{server_name}__{tool_name}` direct tools; and explicitly execute visible assistant MCP tool calls after a click, writing flattened text output into the existing tool-response field.
- Explicit non-goals: no full built-in OAuth authorization-code callback, token refresh, revoke, or account-management flow; no resources browser; no prompts browser; no sampling, elicitation, or tasks; no automatic MCP execution during agent streaming; no MCP registry browsing; no global permission policy beyond explicit per-call user action.
- Visible gaps: real third-party authenticated remote MCP services remain unaudited; full OAuth lifecycle is intentionally out of scope; readiness stores a last-known snapshot rather than a background health monitor; MCP outputs are flattened to text rather than preserving rich resource/blob payloads; threads must add MCP tools explicitly one by one; direct tool names are disabled rather than auto-suffixed when normalized MCP tool names collide. Resources/prompts are an intentional near-term non-goal because expected usage is low for the current product stage.

## Remote MCP Diagnostics

- Status: shipped V1
- Freshness: confirmed
- Last checked: 2026-07-04
- Evidence:
  - Current discovery screenshot `audits/2026-07-04-202128-remote-mcp-diagnostics-discovery/03-settings-mcp-remote-form.png` shows Streamable HTTP configuration is possible with URL and headers.
  - Current discovery screenshot `audits/2026-07-04-202128-remote-mcp-diagnostics-discovery/04-remote-connection-error.png` shows an unreachable remote endpoint collapses to `Unable to connect. Is the computer able to access the url?`.
  - Current discovery screenshot `audits/2026-07-04-202128-remote-mcp-diagnostics-discovery/05-add-mcp-error-popover.png` shows the same remote failure is visible from the thread Add MCP popover, but without a transport-specific diagnosis.
  - `apps/desktop/src/bun/mcp/mcp-manager.ts` supports Streamable HTTP and SSE transports through the MCP SDK, resolves env/header values, redacts sensitive text, and persists readiness snapshots.
  - `apps/desktop/src/bun/mcp/mcp-manager.ts` now captures compact diagnostics around config validation, secret/env/header resolution, transport open, MCP initialize, and list-tools phases.
  - `apps/desktop/src/components/settings/mcp-page.tsx` now renders the latest diagnostic timeline and copy summary action under readiness.
  - `apps/desktop/src/components/thread-playground/tool/mcp-tool-import-popover.tsx` now surfaces the latest diagnostic headline and routes full details to Settings.
  - Implementation screenshots `audits/2026-07-04-211429-remote-mcp-diagnostics-v1/01-settings-remote-success-diagnostics.png`, `02-settings-remote-auth-diagnostics.png`, `03-settings-remote-env-diagnostics.png`, and `04-add-mcp-diagnostic-headline.png` verify success, auth failure, missing-env failure, and Add MCP handoff states at 1280x800.
  - Persisted-summary verification in the implementation loop confirmed diagnostic summaries omit query strings, bearer/header values, and fixture secret values while preserving endpoint origin and path.
  - Post-review fixture verification covers Streamable HTTP success, 401/403 auth, missing env/header, SSE success, malformed protocol response, 404 transport mismatch, timeout, and a stdio control case with no diagnostic rendered.
- Boundary: users can enter remote MCP URL/header settings, run a connection test, see whether the latest failure came from config, secret resolution, transport/auth/HTTP/protocol, initialization, list-tools, or final result, copy a redacted diagnostic summary, and open Settings from the thread Add MCP popover for full details.
- Explicit non-goals: no full OAuth authorization-code callback, no token refresh/revoke/account lifecycle, no MCP resources/prompts, no registry browsing, no automatic execution, no background monitor.
- Visible gaps: no real third-party authenticated remote MCP service audit; no full OAuth authorization-code lifecycle; no background health history beyond latest readiness/diagnostic snapshot; no raw request/response protocol inspector.

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

## Skill Discovery And Runtime Loading

- Status: partially shipped, evidence-limited
- Freshness: unknown
- Last checked: 2026-07-08
- Evidence:
  - Source inspection on 2026-07-08 found `apps/desktop/src/components/settings/skills-page.tsx` exposes a Settings > Skills page with discovery folders, per-skill enable switches, bulk enable/disable, and folder removal confirmation.
  - Source inspection found `apps/desktop/src/bun/skills/skills-manager.ts` persists `settings/skills.json`, seeds default discovery folders, validates `SKILL.md` frontmatter, resolves enabled skills by name, and reads selected skill content for runtime use.
  - Source inspection found `apps/desktop/src/bun/skills/seed.ts` seeds a bundled `deep-research` skill under the app data root on fresh installs.
  - Source inspection found `apps/desktop/src/components/thread-playground/examples/prompts.ts` injects enabled skills into the General Agent starter thread's `<available-skills>` reminder.
  - Source inspection found `apps/desktop/src/bun/tools/built-in/fs.ts` implements the runtime `skill()` tool and returns the selected skill base directory plus `SKILL.md` body.
  - Current CEF/CDP product-surface verification was attempted with an isolated `LLM_SPACE_HOME` on port `9381`, but Electrobun stayed in the CEF dependency download path and never exposed CDP during this loop.
- Boundary: source evidence indicates users can configure local skill discovery folders, enable or hide discovered skills, seed a bundled Deep Research skill, expose enabled skills in the General Agent starter context, and load skill instructions at runtime through `skill(name)`.
- Explicit non-goals: no skill creation/editing UI, no runtime skill preview/test call from Settings, no skill provenance panel inside threads, no conflict resolution for duplicate names beyond first-folder-wins, no packaged skill registry/marketplace.
- Visible gaps: rendered flow is unconfirmed in this loop; users likely cannot test from Settings that a skill can be loaded by a thread, see which skills a particular thread captured, or diagnose duplicate/invalid skills without source-level knowledge.

## Bundled Extension Authoring

- Status: shipped internal V1 for trusted bundled tool modules
- Freshness: confirmed
- Last checked: 2026-07-11
- Evidence:
  - `apps/desktop/src/bun/app/start-desktop-app.ts` is the production composition root and constructs process-scoped model, MCP, search, skills, trace, analytics, storage, streaming, updater, RPC, and window dependencies explicitly.
  - `apps/desktop/src/bun/host/desktop-host.ts` registers bundled modules before RPC/window creation, freezes contributions, reports module-context startup failures, and performs reverse-order best-effort cleanup.
  - `apps/desktop/src/bun/tools/tool-registry.ts` snapshots and freezes `ToolContribution` definitions, rejects duplicate ids/names, lists tools, and dispatches calls through the unchanged RPC contract.
  - `apps/desktop/src/bun/tools/built-in/built-in-tools-module.ts` is the reference bundled module. Filesystem and web tool factories receive only declared workspace, skill, search, and environment dependencies.
  - `apps/desktop/src/bun/app/shutdown-coordinator.ts` synchronously cancels the first Electrobun quit, awaits idempotent runtime cleanup, and permits the second quit.
  - Final verification on 2026-07-11: `bun test` passed 42/42; core TypeScript and Vite production build passed; lint had only the existing `HELLO_WORLD_BUILT_IN_TOOLS` warning; desktop TypeScript had only the matching existing unused-variable diagnostic.
  - Real CEF verification on port 9341 returned all 16 original tool names in order, called `todo_write` with `{ contentText: "OK" }`, reported zero horizontal overflow, and showed no relevant console errors.
- Boundary: a core-team author can add a trusted, compile-time bundled Bun module that contributes built-in tools, receives explicit narrow dependencies, fails startup with module context, and participates in deterministic lifecycle. The registry is permanently frozen before RPC/window creation; existing renderer, RPC, persistence, and tool behavior stay unchanged.
- Explicit non-goals: no public plugin SDK, third-party or runtime package loading, manifests, marketplace, dynamic enable/disable, hot reload, sandboxing, permissions, compatibility negotiation, renderer/UI contribution points, or contribution types beyond built-in tools.
- Visible gaps: no plugin discovery or user management surface; no isolation or trust model; no compatibility/version contract; additional contribution seams should be added only after a concrete product use case proves them necessary.

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

- Status: shipped V2 with Structured Evaluation Rubrics V1
- Freshness: confirmed
- Last checked: 2026-07-10
- Evidence:
  - Current CEF screenshot `audits/2026-07-10-145713-evaluation-rubrics-discovery/01-current-run-history.png` shows two durable run cards, comparison selection, inspect/restore actions, and one saved evaluation in the 1280x800 desktop renderer.
  - Current CEF screenshot `audits/2026-07-10-145713-evaluation-rubrics-discovery/02-current-evaluation-dialog.png` shows the comparison dialog with Run A/Run B evidence, five fixed overall verdicts, and one unstructured evaluation note; there is no criterion/rubric configuration or per-side structured score.
  - Current CDP checks on 2026-07-10 found `documentElement.scrollWidth === innerWidth === 1280`, a 1040x728 evaluation dialog inside the 1280x800 viewport, and no relevant console errors.
  - Current screenshot `04-trace-fixture-run-history.png` shows a saved evaluation card for two runs.
  - Current screenshot `05-current-evaluation-dialog.png` shows the evaluation dialog comparing two run snapshots with model/message metadata, system prompt, last user message, result text, tool inputs, and tool outputs.
  - Implementation audit screenshots `04-evaluation-dialog-with-inspect.png` and `06-inspector-inside-evaluation.png` show each comparison side can open a read-only inspector inside the saved evaluation dialog without stacking a second modal.
  - Structured-rubric screenshot `audits/2026-07-10-154419-structured-evaluation-rubrics-v1/05-six-criterion-editor.png` shows the same-dialog editor at the maximum six-criterion boundary.
  - Structured-rubric screenshot `audits/2026-07-10-154419-structured-evaluation-rubrics-v1/06-six-criterion-scorecard.png` shows complete 1-5 scores for both runs and the derived aggregate summary.
  - Structured-rubric screenshot `audits/2026-07-10-154419-structured-evaluation-rubrics-v1/07-reversed-six-criterion-scorecard.png` shows the same run-keyed scores with A/B orientation reversed and a correctly flipped directional verdict/delta.
  - Structured-rubric screenshot `audits/2026-07-10-154419-structured-evaluation-rubrics-v1/08-saved-snapshot-after-revision.png` shows the immutable saved v1 snapshot remaining selectable beside the edited v2 definition.
  - Structured-rubric screenshot `audits/2026-07-10-154419-structured-evaluation-rubrics-v1/09-delete-confirmation.png` documents the destructive-action guard and explains that historical snapshots survive definition deletion.
  - Structured-rubric screenshot `audits/2026-07-10-154419-structured-evaluation-rubrics-v1/10-narrow-scorecard.png` plus CDP geometry checks confirm a 700x700 viewport has no document or dialog horizontal overflow.
  - The isolated persisted Thread JSON retained one six-criterion rubric snapshot and twelve scores keyed by the two stable run IDs after save, reload, definition revision, and definition deletion.
  - Real CDP keyboard smoke confirmed roving radio focus and ArrowRight/ArrowDown, ArrowLeft/ArrowUp, Home, End, Space, and Tab behavior; the final renderer console contained no errors.
  - Twenty-four focused Bun tests cover schema bounds, malformed/duplicate normalization, rubric CRUD/revisions/caps, immutable snapshots, unordered run-pair orientation, score completeness/aggregation, cross-rubric isolation, and saved-snapshot score restoration.
  - `packages/core/src/types/threads/thread.ts` models legacy and structured evaluations as a compatible union with bounded rubric/snapshot/score data.
  - `apps/desktop/src/components/thread-playground/run-evaluation-dialog.tsx`, `run-evaluation-scorecard.tsx`, and `evaluation-rubric-editor.tsx` implement the comparison, scoring, and rubric-management surfaces.
- Boundary: two durable runs in one thread can be compared and inspected, labeled with the existing overall verdict/note, or scored against a reusable thread-owned rubric with 2-6 ordered criteria and complete integer 1-5 scores. One evaluation per unordered pair persists immutable rubric evidence, per-run scores, unweighted averages, and B-minus-A delta; editing or deleting the reusable definition does not alter history, and legacy verdict-only evaluations remain valid.
- Explicit non-goals: dataset/experiment runner, automated or model judge, weighted/formula criteria, thresholds, global rubric library, multiple evaluations per run pair, CI/export, cloud sync, evaluation telemetry, and raw side-by-side trace diff.
- Visible gaps: rubric weights and mixed criterion types, reusable cross-thread libraries, aggregate experiment tables, evaluation cost comparison, dataset execution, automated judges, and side-by-side trace/timing diff remain unimplemented. The 80% rubric-backed completion target still needs a ten-comparison maintainer dogfood set after merge.

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

## External Trace Import

- Status: shipped V1
- Freshness: confirmed
- Last checked: 2026-07-06
- Evidence:
  - Current discovery screenshot `audits/2026-07-05-160904-langfuse-trace-import-discovery/01-current-native-debug-surface.png` shows the product can render a native reduced debug fixture with assistant thinking, tool calls, token usage, manual continuation state, and Run history.
  - Current discovery screenshot `audits/2026-07-05-160904-langfuse-trace-import-discovery/02-current-run-trace-inspector.png` shows the saved-run trace inspector can render a local `ThreadRunSnapshot` as a non-mutating debug view with usage and step evidence.
  - Current discovery screenshot `audits/2026-07-05-160904-langfuse-trace-import-discovery/03-raw-langfuse-opens-empty.png` shows a Langfuse-observation-shaped JSON file opens as an empty thread with no run history, losing the observation rows for debugging.
  - Implementation screenshot `audits/2026-07-05-160904-langfuse-trace-import-v1/03-final-cef-trace-debug.png` shows the new `Files | Traces` sidebar, a manual Langfuse Trace Project, an imported `llm-call` trace row, and the trace opened directly in a reused `ThreadPlayground` debug workbench.
  - CEF verification on port `9367` with isolated runtime root created a Trace Project, imported the supported Langfuse Observations JSON fixture, opened the trace tab, displayed user/assistant messages, usage (`98 in / 68 out`), a `web_search` tool call/result, and a compact `Langfuse · Manual Import · trace trace-1` context header.
  - The same CEF run confirmed the tab-bar `New blank thread` command still creates and opens `workspace/untitled.json` while the sidebar is in `Traces` mode.
  - Storage verification under the isolated root showed trace-owned files at `traces/projects/{project_id}/traces/llm-call-17fe6f3033/raw.json`, `trace.json`, and lazy-created `workbench.json`, with no `workspace/` thread created by the trace import path.
  - `apps/desktop/src/bun/traces/trace-manager.ts` owns trace-project storage and best-effort Langfuse JSON normalization for `{ data: [...] }` and bare observation arrays.
  - `apps/desktop/src/components/trace-panel/trace-panel.tsx` provides the independent Trace Panel with project creation, selected-project import, and trace rows.
  - `apps/desktop/src/components/thread-tabs/use-thread-tabs.ts` and `trace-tab-pane.tsx` add typed trace tabs backed by trace-owned `workbench.json`.
  - `apps/desktop/src/lib/import-threads.ts` and `packages/core/src/parsers/thread-parser-registry.ts` only route `.json` files through the generic JSON thread parser.
  - `packages/core/src/parsers/json-thread-parser.ts` accepts any non-foreign JSON that satisfies the optional-field `Thread` schema; a Langfuse observations payload with top-level `data` can therefore be written as a native-looking but empty thread instead of being rejected or normalized.
  - `packages/core/src/parsers/normalize-thread.ts` normalizes OpenAI/Anthropic chat-like `messages`, tools, images, tool calls, and tool results, but has no Langfuse trace/observation normalization path.
  - External Langfuse docs reviewed on 2026-07-05 say Langfuse traces are containers of observations, Observations API v2 returns row-level spans/generations/events, and UI/Blob exports can produce JSON/JSONL data that includes observations and trace context.
  - Protocol repair on 2026-07-06 checked the current Langfuse OpenAPI: v2 observations expose field groups including `io`, but input/output are always raw strings and `parseIoAsJson=true` is deprecated and returns 400. `TraceManager` now decodes JSON-shaped raw strings locally when creating the workbench and repairs existing workbench text wrappers such as `{"content":"..."}` on read.
- Boundary: users can create local Trace Projects, manually import supported Langfuse JSON (`{ data: [...] }` or bare observation arrays) into the selected project, list imported traces in the dedicated Trace Panel, and open each trace directly as a trace tab that reuses `ThreadPlayground` over a lazy-created trace-owned `workbench.json`. Langfuse raw-string IO is normalized into user/assistant/tool text where it clearly wraps message content.
- Explicit non-goals: no live Langfuse sync, no automatic connect UI, no JSONL in V1, no write-back to Langfuse, no account-management flow, no OTLP collector, no full read-only trace timeline UI, no Trace/Debug/Runs detail tabs in V1, and no mixing trace-owned workbenches into `workspace/`.
- Visible gaps: no background sync, no JSONL import, no full raw trace timeline, no import preview, no delete/rename/credential-rotation project management, no schema-specific coverage for every Langfuse export variant, and no global trace search.

## Langfuse Connected Trace Source

- Status: shipped V1
- Freshness: confirmed
- Last checked: 2026-07-06
- Evidence:
  - Pre-implementation CEF discovery screenshot `audits/2026-07-05-221840-langfuse-connect-v1/01-current-trace-panel-empty.png` showed the Trace Panel empty state only supported creating a local Trace Project and manually importing Langfuse JSON; there was no connect/test/sync entry.
  - Pre-implementation CEF snapshot on 2026-07-05 showed the Trace Panel toolbar actions were `New Trace Project` and `Import Langfuse Export`; there was no API credential path.
  - `.env` at the repo root contains `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`, and `LANGFUSE_SECRET_KEY`; discovery checked names/presence only and did not log secret values.
  - A redacted API smoke against the configured Langfuse host returned `200` for `GET /api/public/projects` and found one accessible project, proving the provided keys can read the project-scoped API.
  - A redacted API smoke against `GET /api/public/v2/observations?limit=3&fields=core,basic,time,io,model,usage,trace_context,metrics` returned observation rows with trace ids, project ids, input/output, model, usage, cost, and trace context fields that match the existing manual-import normalizer inputs.
  - `apps/desktop/src/shared/traces.ts` already reserves `TraceProjectSource` mode `connected`, but it does not persist credentials, sync status, or imported-at cursors.
  - `apps/desktop/src/bun/traces/trace-manager.ts` imports already-read JSON files only; it has no Langfuse HTTP client, credential storage, API pagination, or source test method.
  - `apps/desktop/src/components/trace-panel/trace-panel.tsx` has local project creation/import UI only and no connect form or sync action.
  - Langfuse OpenAPI on 2026-07-05 declares Basic Auth and public endpoints for project, trace, and v2 observation reads; v2 observations expose field selection and cursor/pagination-oriented extraction.
  - Implementation screenshot `audits/2026-07-05-221840-langfuse-connect-v1/02-connected-sync-debug.png` shows a connected Langfuse Trace Project with redacted key preview, explicit trace-id/search sync controls, a synced trace row, and the trace opened directly in the reused `ThreadPlayground` debug workbench.
  - CEF verification with isolated `LLM_SPACE_HOME` connected a Langfuse project from the Trace Panel using `.env` credentials, showed `No traces synced yet` after connect, searched recent remote traces, synced a selected trace, opened it as a trace tab, and confirmed no relevant console errors or horizontal overflow at 1280px.
  - Storage verification confirmed `traces/projects/{project_id}/project.json` persists full local `publicKey` and `secretKey` as requested, while `traceListProjects` / `traceCreateConnectedProject` responses strip full keys and expose only redacted previews.
  - Bun smoke verification confirmed failed credential tests do not create a project, successful sync writes `raw.json` and `trace.json`, repeat sync upserts by remote trace id, and existing `workbench.json` is preserved.
  - `apps/desktop/src/bun/traces/langfuse-client.ts` owns Basic Auth, base URL normalization, redacted HTTP errors, bounded recent trace search, and bounded v2 observation fetching.
  - `apps/desktop/src/bun/traces/trace-manager.ts` now creates connected projects after credential validation, rejects manual JSON import for connected projects, syncs selected Langfuse trace ids, persists redacted sync status/errors, and reuses the manual trace normalizer/write path.
  - `apps/desktop/src/components/trace-panel/trace-panel.tsx` now exposes `Connect Langfuse`, connected project badges/previews, no-auto-sync empty state, trace-id sync, remote trace search/select sync, and manual import only for manual projects.
  - Polish audit screenshots `audits/2026-07-05-232553-trace-panel-polish/11-clean-connected-list.png`, `13-clean-sync-dialog-final.png`, `14-clean-connect-dialog.png`, and `15-clean-empty-traces.png` confirm the Trace Panel now has a visible panel title, clearer project/source hierarchy, labeled Langfuse connection fields, and a two-path sync dialog for exact trace-id sync or search/select sync.
  - Follow-up screenshot `audits/2026-07-05-232553-trace-panel-polish/16-connect-dialog-no-project-name.png` confirms connected Langfuse setup now only asks for base URL, public key, and secret key; the local project name is derived after validation.
  - Clean CEF verification on port `9372` confirmed no horizontal overflow at 1280px and no relevant console errors after the polish pass; screenshots and DOM text showed only redacted key previews.
  - Trace header/protocol repair evidence on 2026-07-06: CEF screenshot `audits/2026-07-06-trace-head-protocol/01-existing-cef-trace-head.png` shows the trace source header moved into `ThreadPlayground`, with the trace id rendered as a compact badge and a `Copy trace ID` action; DOM check showed no horizontal overflow.
  - Focused Bun regressions on 2026-07-06 verified trace title rename updates `trace.json`, `workbench.json`, and the listed trace title; v2 raw-string IO imports produce normal system/user/assistant text; existing workbenches with JSON wrapper text are repaired on read.
- Boundary: users can create a connected Langfuse Trace Project by entering base URL/public key/secret key, validate before save, persist the local connection in `project.json`, explicitly sync by trace id or by selecting from a bounded recent remote trace search, upsert the same remote trace without duplicating local rows, and open the synced trace in the existing trace-owned Debug workbench. Trace tabs expose editable trace titles, source context inside the workbench header, and a copyable trace-id badge.
- Explicit non-goals: no background daemon or automatic initial sync, no write-back to Langfuse, no org-wide multi-project account picker in V1, no full secret display after save, no OAuth, no OTLP collector, no raw timeline UI, no automatic deletion of local traces when remote traces disappear, and no exhaustive historical backfill.
- Visible gaps: date-range/cursor UI for large projects, credential rotation/delete/rename project management, richer sync diagnostics/history beyond latest redacted status, full raw trace timeline, global trace search, and JSONL/export variant expansion.

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
