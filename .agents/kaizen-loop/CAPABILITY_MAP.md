# LLM Space Capability Map

- Last updated: 2026-07-03
- Map status: updated after Trace Inspector V1 implementation, CEF verification, and local product-design audit.
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
- Last checked: 2026-07-03
- Evidence:
  - Current screenshot `02-starter-thread-current.png` shows `Start from Example` now opens a prompt-example chooser rather than directly creating a single starter thread.
  - Current screenshot `03-example-thread-opened.png` shows a `general-agent` prompt example opened with a populated system prompt, fallback model, and an empty user message.
  - `apps/desktop/src/components/start-from-example-dialog.tsx` exposes the chooser.
  - `apps/desktop/src/components/thread-playground/prompt/prompt-examples.ts` defines the available prompt examples and stable file stems.
  - `apps/desktop/src/components/thread-playground/thread-playground.tsx` resolves a fallback model and enables run when a model exists.
- Boundary: user can choose built-in prompt examples or blank threads, then manually edit model, tools, system prompt, and messages inside one thread file.
- Explicit non-goals: multi-file prompt projects, template marketplace, automated prompt optimization.
- Visible gaps: examples still open with an empty first user message; no guided task setup after choosing an example.

## Run And Streaming

- Status: shipped core loop
- Freshness: confirmed
- Last checked: 2026-07-03
- Evidence:
  - Current screenshots `03-example-thread-opened.png` and `06-restored-run-message-view.png` show `Run` enabled once a fallback model exists.
  - `apps/desktop/src/components/thread-playground/stores/thread-store.ts` streams through `streamThread()`, folds reducer events into messages, and records completed runs.
  - `apps/desktop/src/components/thread-tabs/thread-tab-pane.tsx` wires a single Electrobun RPC transport into the active thread.
- Boundary: one thread can run against its selected or fallback model, stream assistant/tool output, abort, and persist completed state.
- Explicit non-goals: batch runs, scheduled runs, provider health validation.
- Visible gaps: no live run was executed in this discovery because the recommendation does not require API quota use.

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
