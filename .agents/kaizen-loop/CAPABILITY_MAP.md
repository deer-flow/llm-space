# LLM Space Capability Map

- Last updated: 2026-07-02
- Map status: updated after Thread Starter V1 implementation and CEF verification.
- Evidence rule: entries marked `confirmed` cite current rendered-product or current-code evidence. Entries marked `stale` rely on recent logs or code paths that were not fully re-inspected in this loop. Entries marked `unknown` need a future product-surface check before they can drive a recommendation.

## First-Run Model Setup

- Status: shipped V1
- Freshness: confirmed
- Last checked: 2026-07-02
- Evidence:
  - Current discovery screenshot `audits/2026-07-02-233240-discovery-next-feature/02-provider-ready-empty-workspace.png` shows onboarding can add `OpenAI Codex`.
  - `apps/desktop/src/components/onboard-dialog.tsx` fetches builtin provider discovery and adds detected providers through existing model hooks.
  - Recent log `logs/2026-07-02-195244-first-run-model-setup-v1.md` verified provider persistence and no secret exposure.
- Boundary: first launch with no configured provider can detect local credentials, add a provider, and reach a runnable model without entering Settings first.
- Explicit non-goals: no real provider connectivity test, no quota/API test run, no setup wizard state machine, no secret display.
- Visible gaps: no real provider connectivity test after setup; starter creation now covers the empty-workspace first useful task path.

## Workspace And Thread Management

- Status: operational, starter path added
- Freshness: confirmed
- Last checked: 2026-07-02
- Evidence:
  - Current discovery screenshots `03-empty-workspace-after-onboarding.png` and `04-new-thread-created.png` show an empty workspace followed by a quick-created `untitled` thread.
  - Thread Starter V1 audit screenshots `audits/2026-07-02-235003-thread-starter-v1/01-empty-workspace-starter-action.png`, `02-starter-thread-opened.png`, and `03-blank-thread-still-available.png` verify starter and blank thread creation.
  - `apps/desktop/src/components/file-system-tree-view/use-file-system-tree.ts` creates quick files as auto-named JSON threads.
  - `apps/desktop/src/components/thread-tabs/use-thread-tabs.ts` restores/open tabs and defaults first-run tabs to `example.json` only when persisted tab state is absent.
- Boundary: local workspace tree, tabs, rename/move/delete/duplicate/reveal, starter/blank thread creation, and local JSON persistence.
- Explicit non-goals: cloud sync, cross-workspace projects, external file watching beyond current tree refresh behavior.
- Visible gaps: the sidebar empty state still has generic `Create a thread to get started` copy; richer workspace project organization remains out of scope.

## Prompt And Thread Building

- Status: manual builder with starter V1
- Freshness: confirmed
- Last checked: 2026-07-02
- Evidence:
  - Current discovery screenshot `04-new-thread-created.png` shows model fallback selected, empty system prompt placeholder, empty user message placeholder, `Add tool`, and `Run` enabled.
  - Thread Starter V1 audit screenshot `02-starter-thread-opened.png` shows `agent-starter` with non-empty system prompt and first user task.
  - `apps/desktop/src/shared/thread-starters.ts` defines browser-safe blank and starter thread factories.
  - `apps/desktop/src/components/welcome.tsx` exposes `Start from Example` and `Blank thread`.
  - `apps/desktop/src/components/thread-playground/thread-playground.tsx` resolves a fallback model and enables run when a model exists.
  - `apps/desktop/src/bun/workspace/example.ts` reuses the starter factory for fresh workspace seeding.
- Boundary: user can manually edit model, tools, system prompt, and messages inside one thread file.
- Explicit non-goals: multi-file prompt projects, template marketplace, automated prompt optimization.
- Visible gaps: only one starter exists; blank threads can still be intentionally run empty.

## Run And Streaming

- Status: shipped core loop
- Freshness: confirmed
- Last checked: 2026-07-02
- Evidence:
  - Current discovery screenshot `04-new-thread-created.png` shows `Run` enabled once a fallback model exists.
  - `apps/desktop/src/components/thread-playground/stores/thread-store.ts` streams through `streamThread()` and records completed runs.
  - `apps/desktop/src/components/thread-tabs/thread-tab-pane.tsx` wires a single Electrobun RPC transport into the active thread.
- Boundary: one thread can run against its selected or fallback model, stream assistant/tool output, abort, and persist completed state.
- Explicit non-goals: batch runs, scheduled runs, provider health validation.
- Visible gaps: blank threads can still be run without content; Thread Starter V1 provides a better default path but does not block empty runs.

## Debug Timeline

- Status: shipped V1
- Freshness: confirmed
- Last checked: 2026-07-02
- Evidence:
  - Current discovery DOM/screenshot evidence shows the run-history panel exists and starts empty for a new thread.
  - Recent log `logs/2026-07-02-181903-debug-timeline-v1.md` verified durable run history and restore after restart.
  - `apps/desktop/src/components/thread-playground/run-history-list-view.tsx` renders run history and restore controls.
- Boundary: recent completed runs are recorded per thread, listed in the Run history panel, and restorable.
- Explicit non-goals: full trace event persistence, step-through trace inspector, global run database.
- Visible gaps: no run exists until the user has a useful prompt to run.

## Evaluation Workspace

- Status: shipped V1
- Freshness: stale
- Last checked: 2026-07-02, in the previous loop
- Evidence:
  - Recent log `logs/2026-07-02-205111-evaluation-workspace-v1.md` verified two-run comparison, saved verdict/note, JSON persistence, restart, and reopen.
  - `packages/core/src/types/threads/thread.ts` includes optional `evaluations`.
  - `apps/desktop/src/components/thread-playground/run-history-list-view.tsx` includes compare selection and saved evaluation list.
- Boundary: two durable run snapshots in one thread can be compared manually, labeled with a verdict, annotated, and persisted with the thread.
- Explicit non-goals: dataset runner, automated judge, global evaluation database, reusable rubrics.
- Visible gaps: the empty-thread path does not generate the useful runs that make evaluation valuable.

## Trace Inspection

- Status: not mapped
- Freshness: unknown
- Last checked: unknown
- Evidence:
  - README promises Trace, but this loop did not inspect a successful run trace surface.
- Boundary: unknown until current rendered evidence is captured.
- Explicit non-goals: unknown.
- Visible gaps: likely no confirmed inspector for why an evaluated run won or failed, but this needs a fresh product check.

## Model Settings And Provider Management

- Status: operational settings surface
- Freshness: stale
- Last checked: 2026-07-02, in first-run setup loop
- Evidence:
  - Recent log `logs/2026-07-02-195244-first-run-model-setup-v1.md` verified provider add/persist flows through onboarding and settings.
  - `apps/desktop/src/components/settings/models-page.tsx` owns provider/model CRUD UI.
- Boundary: manage builtin/custom providers and enabled models through local settings.
- Explicit non-goals: account management, cloud sync, provider billing/quota checks.
- Visible gaps: no V1 connectivity validation after a provider is configured.
