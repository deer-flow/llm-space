---
name: kaizen-loop
description: Run one 0-1 product kaizen loop. Use when the user asks to inspect a product, decide what to build next, plan or implement the next coherent capability, audit a workflow, or advance beyond maintenance. Ground the loop in current product evidence, external market scan when proposing new product functionality, capability-map freshness, one north-star metric, one main recommendation plus two alternatives, and an approval gate before product-code changes.
---

# Kaizen Loop

Run one 0-1 product iteration loop for the current product: inspect evidence, diagnose the product, recommend the next capability, define its v1 shape, write an implementation plan, wait for approval, optionally implement the approved slice, verify it, and write a durable product decision log.

The kaizen posture is product building, not maintenance hunting. Choose technical work only when it directly unlocks, accelerates, or protects a product-level capability.

## Core Rules

- Read the local project contract before coding: `AGENTS.md`, `CLAUDE.md`, README, architecture docs, package scripts, or equivalent. Treat the discovered conventions as binding.
- Inspect `git status --short` before changing files. Never revert user changes.
- Keep one loop to one product capability or one workflow improvement.
- Define a product-level north-star metric before planning. No metric, no loop.
- Ground recommendations in evidence. If evidence is too thin, ask one focused product-context question instead of inventing a direction.
- Present the product recommendation and implementation plan, then wait for explicit approval before editing product code unless the user has already approved that exact plan.
- Stop and report rather than guessing when a blocker changes product behavior, risks data loss, exposes secrets, or prevents required verification.

## Product Scope

- One loop equals one coherent v1 capability, not one tiny patch.
- Scope the work as the smallest complete version a user can actually experience.
- The implementation may touch multiple files or modules when needed for the end-to-end experience.
- Record v2/v3 follow-ups, but execute only the selected v1 in the current loop.
- Do not expand into broad roadmap execution, a multi-week feature, or an unclear product bet.
- Honor the product's existing architecture, package manager, design system, generated-code boundaries, validation commands, and release surface.

## Capability Map

Maintain `.agents/kaizen-loop/CAPABILITY_MAP.md` as the current product capability boundary map.

- Treat logs as history and the capability map as the current map. Neither replaces current product evidence.
- If the map is missing, create an initial map during discovery from product context plus the current product surface.
- Organize the map by user capabilities, not code modules, pages, screens, or implementation layers. Code paths are evidence under a capability.
- For each capability, track status, freshness, last checked date, evidence, boundary, explicit non-goals, and visible gaps.
- Use only three freshness values: `confirmed`, `stale`, and `unknown`.
- Before recommending, inspect the current UI for UI products, or the runnable product surface for non-UI products, for the capabilities relevant to this loop. Only use `confirmed` boundaries as recommendation evidence.
- If the relevant product surface cannot be inspected, mark those capabilities `unknown`, call the loop evidence-limited, and stop or ask the user when the decision depends on them.

## North-Star Metric

Every loop must name one product-level north-star metric in the recommendation, plan, log, and final response.

Include:

- Metric name.
- Why it matters to the 0-1 product.
- Current baseline or evidence source used as the baseline.
- Target for the v1 capability.
- How the target will be checked.
- Guardrails that must not regress, such as build health, accessibility, no visible overflow, no console errors, no broken persistence, unchanged data contracts, or preserved user data.

Good metrics describe product progress, for example: time to first successful outcome, activation rate for a key setup path, completion of a target workflow, confidence in comparing alternatives, ability to inspect/debug a core object, or a workflow completed without critical audit findings.

## Evidence Gate

Before recommending what to build next, inspect enough evidence to avoid guessing.

Minimum evidence:

- Latest local kaizen logs from `.agents/kaizen-loop/logs/`, if present. Read the most recent 1-3 logs.
- `.agents/kaizen-loop/CAPABILITY_MAP.md`, if present. If absent, create it after inspecting the current product surface.
- Product brief, README, roadmap, issue tracker, architecture docs, or other local product context that exists.
- Relevant product/code paths for the workflow under consideration.
- Current git status.
- Current rendered product state when the recommendation touches UX, onboarding, navigation, or workflow.
- External market scan when the loop proposes new product functionality, changes product positioning, or judges what capability is truly missing.

For UX or product-flow recommendations:

- Inspect the real product surface with the best available local tool: browser, desktop inspector, device simulator, screenshots, logs, or product analytics artifacts.
- Do not substitute a mocked environment for a runnable product unless the real product cannot be inspected; if so, state the limitation in the plan and log.
- Pair screenshot review with text, console/log, interaction, layout, and overflow checks when UI behavior can be affected.

The evidence gate is complete only when the main recommendation can cite concrete observations, relevant capability-map entries have `confirmed`/`stale`/`unknown` freshness, and the alternatives can be deferred for explicit reasons.

## External Market Scan

Run a current internet search before recommending any new user-facing capability or workflow. The scan prevents local-only product thinking from mistaking "not present here" for "actually missing."

The scan is complete only when the recommendation can cite:

- Current public evidence from comparable products, docs, changelogs, issue discussions, community workflows, standards, or research relevant to the workflow.
- The expected table-stakes behavior users already get elsewhere.
- One or more real gaps, unmet jobs, confusing tradeoffs, or workflow failures that the product can plausibly address.
- Why the main recommendation targets a true missing capability rather than merely copying a competitor surface.
- Source URLs, access dates, and any uncertainty caused by paywalls, stale pages, inaccessible products, or weak evidence.

Prefer primary sources, recent sources, and sources from actual user workflows. Do not let the market scan override observed product evidence: use it to sharpen the gap, vocabulary, and acceptance criteria. If internet access is unavailable or the user forbids web search, call the loop evidence-limited and ask whether to proceed from local evidence only.

## Discovery Output

Produce one main recommendation plus two alternatives. Only the main recommendation gets a detailed plan.

Include:

1. Product diagnosis: where the current product is thinnest or most blocked.
2. Capability-map freshness: relevant capabilities marked `confirmed`, `stale`, or `unknown`, with current product-surface evidence.
3. North-star metric: product-level metric, baseline, v1 target, acceptance method, and guardrails.
4. External market scan: sources reviewed, table-stakes expectations, true missing capability, and uncertainty.
5. Main recommendation: the one product capability or workflow improvement to build next.
6. Why now: why this beats the alternatives at the current product stage and in the external market context.
7. V1 capability definition: what a user can do after v1 ships, and what remains out of scope.
8. Acceptance and audit plan: how product-design audit, rendered-product checks, commands, tests, or review will prove the result.
9. Implementation plan: likely files/modules, steps, commands, and stop conditions.
10. Alternatives: two reasonable directions not selected, with short reasons to defer them.

Ask for approval before implementation.

## Implementation

Implement only after the user approves the product recommendation and v1 plan.

- First, hand the approved plan to `$grill-me` for a requirements discussion. This gate is complete only when the discussion has resolved the target user/job, must-have behavior, explicit non-goals, acceptance criteria, data or persistence boundaries, risks, and stop conditions. If the discussion changes scope, update the plan and ask for approval again before editing product code.
- If the approved work touches frontend UI or user interaction, broad plan approval is not enough. Before editing product code, present the concrete interaction scheme to the user and get explicit confirmation of entry points, primary actions, states, transitions, keyboard/selection behavior, persistence side effects, and audit evidence. If confirmation changes scope, update the plan and ask for approval again.
- Build the smallest coherent end-to-end version of the approved capability.
- Use the repository's existing package manager, scripts, frameworks, UI primitives, and architecture. Do not introduce a new tool or abstraction unless it is needed for the v1.
- Follow local boundaries for client/server code, generated files, API contracts, persistence, permissions, and data ownership.
- For hot or user-visible paths, preserve performance and interaction stability with the product's established patterns.
- For UI changes, verify rendered behavior in the real product surface with the best available local inspection tool.

Stop if the approved plan proves wrong, required verification is unavailable, or the implementation would need a second product loop.

## Product-Design Audit

Use `$product-design:audit` as an evidence and acceptance tool, not as a ritual.

- During discovery: run or recommend an audit when judging an existing product flow would materially improve the recommendation.
- During planning: define audit acceptance criteria for the selected v1 capability when it touches a product surface.
- After implementation: run `$product-design:audit` for UI, visual, interaction, onboarding, settings, navigation, checkout, activation, or other product-surface changes.
- For planning-only loops: do not force an audit, but record how future acceptance should be audited.
- For technical work that directly unlocks a product capability: audit may be not applicable, but explain the product capability it unlocks and verify with commands/review.

Unless the user explicitly names another destination, use a local audit directory:

```text
.agents/kaizen-loop/audits/YYYY-MM-DD-HHMMSS-short-slug/
```

The audit must use screenshots or artifacts captured in the current run. Do not reuse old screenshots or memory.

## Review And Verification

Before handoff after implementation:

1. Inspect the diff as a reviewer, prioritizing product regressions, broken workflows, architecture boundary violations, missing states, and missing verification.
2. Run validation commands relevant to the touched files, preferring the commands named in the local project contract.
3. Run focused rendered-product verification for UI behavior, visual changes, onboarding, navigation, or other product surfaces.
4. Run `$product-design:audit` when the approved capability changes a product surface.
5. Update `.agents/kaizen-loop/CAPABILITY_MAP.md` so shipped, partial, stale, and unknown boundaries match the verified product surface.
6. Fix findings that are clearly in scope; otherwise record them as follow-ups.

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

Write the log as a product decision record plus engineering result. Include:

- Status: `draft` or `done`.
- Trigger: user request and starting git status.
- Product stage/context.
- Evidence reviewed.
- External market scan: source URLs, access date, table-stakes expectations, true missing capability, and uncertainty.
- Capability-map freshness: entries read, entries updated, and any stale or unknown boundaries.
- Product north-star metric: name, reason, baseline, target, measurement method, and guardrails.
- Candidate product opportunities: main recommendation and two alternatives.
- Main recommendation: why now, expected product value, and rejected alternatives.
- V1 capability definition: user-visible behavior, scope, and explicit non-goals.
- Acceptance/audit plan.
- Implementation plan and approval status.
- `$grill-me` requirements discussion: questions resolved, scope changes, remaining ambiguity, and approval status.
- Work performed, if approved.
- Verification and product-design audit results, if implemented.
- Review: findings, fixes, remaining risks.
- Follow-up product bets.
- Outcome: completed, stopped, or blocked, with the next suggested loop.

Do not log secrets, tokens, private external payloads, or raw auth headers.

## Final Response

If implementation was not approved or not requested, summarize the product recommendation, north-star metric, v1 scope, alternatives, acceptance plan, and log path.

If implementation was completed, summarize the shipped capability, north-star result, capability-map update, audit/acceptance result, verification result, review result, and log path.

If stopped or blocked, say exactly what blocked the loop and what user decision or external state is needed next.
