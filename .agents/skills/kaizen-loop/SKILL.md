---
name: kaizen-loop
description: Run one llm-space self-improvement iteration. Use when the user asks to find, design, implement, verify, audit, and log a scoped project improvement for this Electrobun desktop app or core package, including UX polish, visual hierarchy, interaction flow, frontend architecture, RPC/command behavior, thread-store behavior, bug fixes, or focused feature ideas. Every loop must define a north-star metric and defaults user-facing acceptance to $product-design:audit.
---

# Kaizen Loop

Run exactly one scoped improvement loop for `llm-space`: discover one valuable optimization, define the north-star metric, agree on the plan, implement the slice, verify it, run acceptance, review the diff, and write a durable local log.

## Core Rules

- Read `AGENTS.md` before coding and treat it as the project contract.
- Inspect `git status --short` before changing files. Never revert user changes.
- Keep the loop to one improvement. Do not start a second optimization unless the user explicitly asks.
- Define the loop's north-star metric before planning. No metric, no loop.
- Prefer existing project conventions over new abstractions. Keep diffs surgical and explain tradeoffs.
- Use ambitious thinking with scoped implementation: challenge local patches during discovery, then ship only one verifiable slice.
- Ask one question at a time during discovery. If the answer can be found by reading code, docs, logs, or runtime state, inspect instead of asking.
- Present a concise work plan and wait for explicit user approval before editing code, unless the user has already selected the exact implementation and asked you to apply it.
- Stop and report rather than guessing when a blocker changes product behavior, risks data loss, exposes secrets, or prevents required verification.

## LLM Space Boundaries

- Use the architecture in `AGENTS.md` as the only scope boundary for this project.
- Honor the current project shape: `@llm-space/core` splits browser-safe client/types/utils from Bun-only server code; the desktop app splits Bun main process code from the webview renderer through typed RPC; cross-boundary actions go through commands; generated `components/ui/` files are not hand-edited.
- It is okay to inspect or modify streaming, model, transport, storage, command, and RPC code when the approved loop points there. Treat those as normal project areas with higher verification needs, not as a blanket read-only zone.
- If discovery points to a change that is too large for one loop, log the larger opportunity as a follow-up and choose a smaller slice.

## North-Star Metric

Every loop must name one north-star metric in the plan, log, and final response.

Use a metric that captures the user or maintainer value of this iteration, not only the implementation task. Include:

- Metric name.
- Why it matters.
- Current baseline or the evidence source used as the baseline.
- Target for this loop.
- How the target will be checked.
- Guardrails that must not regress, such as build health, accessibility, no visible overflow, no console errors, or unchanged data contracts.

For UX or visual work, the default target should be observable in the product-design audit, such as "the selected flow has no critical audit findings for the changed step" plus concrete layout or accessibility guardrails.

## Start With Context

1. Read the latest local iteration logs from `.agents/kaizen-loop/logs/` if the directory exists. Prefer the most recent 1-3 logs; do not load old logs wholesale.
2. Read `AGENTS.md`.
3. Check `git status --short`.
4. Skim the likely relevant project area before proposing work.
5. For UI work, inspect the real desktop renderer through `electrobun-cdp-debug` instead of mocking `electrobun.rpc` in a browser.

## Discovery And Plan

Use a grill-style interview only where it beats inspection. Consider:

- Interaction problems: confusing flows, missing states, awkward feedback, unnecessary clicks.
- Visual problems: density, alignment, hierarchy, overflow, readability, desktop-app consistency.
- Code architecture: unclear boundaries, duplicated UI patterns, brittle effects, oversized components, fragile RPC or command routing, and other maintainability issues.
- Feature gaps: small user-facing improvements that fit the existing product direction.

Ground every candidate in repo evidence, runtime evidence, or a fresh audit. Before presenting a plan for any feature idea, refactor, interaction optimization, or module-reuse improvement, run a deeper design pass. Write the approval prompt in English with this order:

1. North-star metric: metric name, why it matters, current baseline or evidence, this loop's target, acceptance method, and guardrails that must not regress.
2. Deeper design pass: the real user or maintainer pain, where the evidence comes from, the root opportunity, one conservative option, one bolder option, the selected thin slice, how it validates the bolder direction, and why the loop should not expand.
3. What will change: the user experience, code behavior, or maintainability problem being addressed; why it is worth doing; the current state; and the target state.
4. How it will change: likely files or modules, implementation steps, commands to run, acceptance method, verification steps, and stop conditions.

Ask for approval before coding.

## Implementation

- Make the smallest change that satisfies the approved plan.
- Use `bun` for all package work. Do not use `npm`, `pnpm`, or `yarn`.
- Do not assume GraphQL, database codegen, web-only builds, or test scripts exist here. Use only commands supported by this repository.
- Follow the renderer/Bun/RPC/command boundaries from `AGENTS.md`.
- Prefer app-level wrappers such as `@/components/tooltip` and `ConfirmDialog`; do not hand-edit generated `components/ui/`.
- For hot renderer paths, keep props stable, use narrow Zustand selectors, and follow the local `memo(_Foo)` pattern only where it pays off.
- For UI changes, verify rendered behavior with the real Electrobun CEF renderer:
  - Start `bun run dev:cef` if CDP is not already available.
  - Use `.agents/skills/electrobun-cdp-debug/scripts/cdp-probe.mjs` for DOM text, console output, screenshots, and targeted evaluations.
  - Do not substitute a normal browser with mocked desktop RPC.
  - Pair text checks with screenshot review, bounding boxes, overflow checks, and viewport/responsive checks when layout can be affected.

Stop if the approved plan proves wrong, CDP verification is required but unavailable, or the implementation would need a second loop.

## Acceptance

Default user-facing acceptance is `$product-design:audit`.

- For UX, visual, interaction, onboarding, settings, navigation, or other product-surface changes, run `$product-design:audit` on the affected screen or flow after implementation.
- Unless the user explicitly names Figma, use a local audit destination under `.agents/kaizen-loop/audits/YYYY-MM-DD-HHMMSS-short-slug/`.
- The audit must use screenshots captured in the current run. Do not reuse old screenshots or memory.
- Treat the audit notes and screenshots as the acceptance record for the north-star metric and product guardrails.
- If a loop is code-only with no capturable product surface, do not invent a fake audit. Record why product-design audit is not applicable, then verify with commands and targeted code review instead.
- If audit is applicable but cannot be completed, stop or mark the loop blocked rather than silently replacing it with a weaker check.

## Review And Verification

Before handoff:

1. Inspect the diff as a reviewer, prioritizing bugs, regressions, missing states, boundary violations, and missing verification.
2. Run `bun run lint:check`.
3. Run `bunx --bun tsc -p packages/core/tsconfig.json --noEmit` when `packages/core` was changed.
4. Run `bunx --bun tsc -p apps/desktop/tsconfig.json --noEmit` when `apps/desktop` was changed.
5. Run `bun run build:canary` for UI, packaging, or desktop build-surface changes when reasonable.
6. Run focused CDP verification for UI behavior or visual changes, including screenshot review plus targeted DOM measurements for alignment, dimensions, overflow, clipping, and unexpected wrapping.
7. Fix review findings that are clearly in scope; otherwise record them as follow-ups.

If a command is unavailable or inappropriate for the touched files, say why in the log and final response.

## Required Log

Always write a Markdown log before the final response, even when the loop stops early. When creating a log during discovery, planning, or implementation, mark it as `Status: draft`. Before the final response, update the same log to `Status: done` after verification/review is complete or after the loop has stopped/blocked.

Use:

```text
.agents/kaizen-loop/logs/YYYY-MM-DD-HHMMSS-short-slug.md
```

Create the directory if needed. Use local time from:

```sh
date "+%Y-%m-%d-%H%M%S"
```

Include:

- Status: `draft` or `done`.
- Trigger: user request and starting git status.
- Previous context: latest logs reviewed, if any.
- North-star metric: name, reason, baseline, target, measurement method, and guardrails.
- Chosen improvement: category, evidence, and rejected alternatives.
- Deeper design pass: pain point, root opportunity, conservative option, bold option, selected slice, and why the loop stayed scoped.
- Plan: approved scope and stop conditions.
- Work performed: important files changed and design decisions.
- Acceptance: product-design audit path and result, or why audit was not applicable.
- Verification: commands, CDP checks, screenshots, console findings, or command failures.
- Review: self-review findings, fixes, and remaining risks.
- Outcome: completed, stopped, or blocked, with next suggested loop.

Do not log secrets, tokens, private external payloads, or raw auth headers.

## Final Response

Summarize the improvement, north-star result, acceptance result, verification result, review result, and log path. If stopped or blocked, say exactly what blocked the loop and what user decision or external state is needed next.
