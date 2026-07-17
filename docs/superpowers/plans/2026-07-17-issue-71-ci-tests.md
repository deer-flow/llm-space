# CI Test Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repository's complete Bun test suite a supported root task and a required pull-request/main-branch CI gate.

**Architecture:** Keep `package.json` as the command implementation layer and expose it through the existing `mise.toml` task front door. Insert the test task into the existing CI check job without changing or removing lint, typecheck, workflow-validation, or production-build gates, then update the repository's contributor instructions to describe the real test framework and gates.

**Tech Stack:** Bun 1.3 test runner, mise tasks, GitHub Actions YAML, Markdown.

## Global Constraints

- Work only in `/Users/minimax/workspace/llm-space/.worktrees/issue-71` on branch `issue-71-ci-tests`.
- Keep Bun/mise as the supported tooling path; do not add npm, pnpm, yarn, or another test framework.
- Preserve all existing lint, typecheck, workflow-validation, and production-build gates.
- Do not push, create a pull request, or modify GitHub issue #71.
- This machine does not have `mise`; verify Bun commands and configuration statically, and do not claim that `mise run test` was executed locally.

---

### Task 1: Expose the existing Bun suite through root and mise tasks

**Files:**
- Modify: `package.json`
- Modify: `mise.toml`

**Interfaces:**
- Consumes: Bun's repository-root test discovery for `*.test.ts` files.
- Produces: root script `bun run test` and user-facing task `mise run test`.

- [ ] **Step 1: Record the missing-entrypoint RED**

Run from the repository root:

```bash
PATH="$HOME/.bun/bin:$PATH" bun run test
```

Expected: non-zero exit because `package.json` has no `test` script. Also inspect `mise.toml`, `.github/workflows/ci.yml`, and `AGENTS.md` to confirm the task, CI gate, and accurate documentation are absent.

- [ ] **Step 2: Add the minimal root script**

Add this entry to the root `scripts` object in `package.json`:

```json
"test": "bun test"
```

- [ ] **Step 3: Add the mise task**

Add this task beside the lint and typecheck tasks in `mise.toml`:

```toml
[tasks.test]
description = "Run all Bun tests"
run = "bun run test"
```

- [ ] **Step 4: Verify the GREEN implementation layer and static task wiring**

Run:

```bash
PATH="$HOME/.bun/bin:$PATH" bun run test
```

Expected: all 11 current test files and all test cases pass. Then parse `mise.toml` with Python's `tomllib` and assert `tasks.test.run == "bun run test"` because `mise` is unavailable locally.

### Task 2: Require tests in CI without weakening existing gates

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the `mise run test` task from Task 1 after dependency installation.
- Produces: a failing-test-sensitive step in the existing `check` job for pushes to `main` and pull requests.

- [ ] **Step 1: Add the CI test step**

Insert this step after `bun install --frozen-lockfile` and before the other code-quality gates:

```yaml
      - run: mise run test
```

- [ ] **Step 2: Validate CI wiring and preserved gates**

Parse all `.github/workflows/*.yml` files with PyYAML, then statically assert that `.github/workflows/ci.yml` still contains workflow validation, `mise run test`, `mise run lint`, `mise run typecheck`, and `bun --filter @llm-space/desktop build:view` in the `check` job.

### Task 3: Correct contributor documentation

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: the supported `mise run test` task and CI behavior from Tasks 1 and 2.
- Produces: contributor-facing instructions that match local and CI gates.

- [ ] **Step 1: Document the test task**

Add a tooling-table row describing `mise run test` as running the complete Bun test suite from the repository root.

- [ ] **Step 2: Replace the stale framework and CI statement**

Replace the claim that no test framework exists with text stating that Bun's built-in test runner discovers the repository's `*.test.ts` files and that CI runs tests, lint, typecheck, workflow-YAML validation, and the production renderer build.

- [ ] **Step 3: Verify documentation consistency**

Search tracked Markdown for the stale phrase `There is **no test framework**` and confirm it is absent, then confirm `AGENTS.md` mentions both `mise run test` and the CI test gate.

### Task 4: Full verification, review, and commit

**Files:**
- Review: all files changed by Tasks 1-3 and this plan.

**Interfaces:**
- Consumes: the complete implementation.
- Produces: fresh validation evidence and one local commit referencing issue #71.

- [ ] **Step 1: Run the complete available verification suite**

Run:

```bash
PATH="$HOME/.bun/bin:$PATH" bun run test
PATH="$HOME/.bun/bin:$PATH" bun run lint
PATH="$HOME/.bun/bin:$PATH" bun run typecheck
```

Expected: every command exits 0. Parse workflow YAML and `mise.toml`, and run the static gate assertions from the earlier tasks. Do not claim `mise run test`, `mise run lint`, or `mise run typecheck` were executed because `mise` is unavailable.

- [ ] **Step 2: Self-review the patch**

Run `git diff --check`, inspect `git diff`, and confirm `git status --short` contains only the intended plan, root script, mise task, CI step, and AGENTS documentation changes.

- [ ] **Step 3: Commit the verified changes**

Run:

```bash
git add docs/superpowers/plans/2026-07-17-issue-71-ci-tests.md package.json mise.toml .github/workflows/ci.yml AGENTS.md
git commit -m "ci: run Bun tests in CI (#71)"
```

Record the commit SHA and do not push it.
