# Lazy Trace Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Trace sidebar from the initial renderer graph and load it only after a tracing-enabled user first selects Traces, while preserving its mounted state across mode switches.

**Architecture:** Replace the static `TracePanel` import in the page composition with `React.lazy`, and render it through the existing `Suspense` boundary only after the effective sidebar mode becomes `"traces"`. A render-time ref latches the panel after its first selection so switching back to Files hides rather than unmounts it, preserving Trace project, tab, query, sidebar, and persistence behavior.

**Tech Stack:** React 19 (`lazy`, `Suspense`, `useRef`), TypeScript, Vite/Rollup production bundle inspection, Bun, ESLint.

## Global Constraints

- Work only in `/Users/minimax/workspace/llm-space/.worktrees/issue-72` on branch `issue-72-lazy-trace`.
- Use Bun and mise; do not use npm, pnpm, or yarn.
- Do not add a brittle source-string test; use the production bundle graph/output as the RED/GREEN proof.
- Do not load or mount `TracePanel` while tracing is disabled.
- Prefer loading `TracePanel` only when Traces is first selected.
- Preserve Trace project, tab, sidebar-state, and persistence behavior across mode switches.
- Keep Files mode and first paint unchanged and introduce no production Vite chunk warnings.

---

### Task 1: Establish the production-bundle regression

**Files:**

- Inspect: `apps/desktop/src/app/page.tsx`
- Inspect: `apps/desktop/dist/assets/*`

**Interfaces:**

- Consumes: Vite's module graph rooted at `apps/desktop/src/mainview/main.tsx`.
- Produces: Recorded RED evidence that the current static `TracePanel` import places distinctive Trace sidebar code in an initial HTML-referenced JavaScript chunk.

- [ ] **Step 1: Build the unmodified renderer bundle**

Run:

```bash
PATH="$HOME/.bun/bin:$PATH" bun --filter @llm-space/desktop build:view
```

Expected: the production build succeeds and prints its generated chunks.

- [ ] **Step 2: Identify initial and Trace-bearing chunks**

Run:

```bash
rg -o 'src="[^"]+\.js"' apps/desktop/dist/index.html
rg -l 'No trace projects|Add trace project|Search remote Langfuse traces' apps/desktop/dist/assets/*.js
```

Expected RED: at least one JavaScript file referenced by `index.html` contains distinctive `TracePanel` UI copy, demonstrating that Trace sidebar code is in the initial static graph.

### Task 2: Lazy-load and latch the Trace sidebar

**Files:**

- Modify: `apps/desktop/src/app/page.tsx`

**Interfaces:**

- Consumes: named export `TracePanel` from `@/components/trace-panel`, `tracingEnabled: boolean`, and `effectiveSidebarMode: "files" | "traces"`.
- Produces: `LazyTracePanel`, a `React.lazy` component whose module is requested only when the effective mode first becomes `"traces"`; `tracePanelMounted.current`, a one-way latch preserving the component after its first mount.

- [ ] **Step 1: Replace the static import with a named-export lazy import**

Add beside the existing lazy overlay definitions:

```tsx
const LazyTracePanel = lazy(() =>
  import("@/components/trace-panel").then((m) => ({
    default: m.TracePanel,
  }))
);
```

Remove:

```tsx
import { TracePanel } from "@/components/trace-panel";
```

- [ ] **Step 2: Add a render-time first-selection latch**

Immediately after computing `effectiveSidebarMode`, add:

```tsx
const tracePanelMounted = useRef(false);
if (effectiveSidebarMode === "traces") tracePanelMounted.current = true;
```

This is deliberately based on the effective mode, so tracing disabled can never trigger the import even if the remembered local component state is `"traces"`.

- [ ] **Step 3: Render the lazy panel only after the latch is set**

Replace the eager Trace panel branch with:

```tsx
{
  tracingEnabled && tracePanelMounted.current && (
    <Suspense fallback={null}>
      <LazyTracePanel
        className={
          effectiveSidebarMode === "traces" ? "min-h-0 flex-1" : "hidden"
        }
        onOpenTrace={handleOpenTrace}
      />
    </Suspense>
  );
}
```

Expected: Files remains visible while the chunk is absent; selecting Traces starts the dynamic import and mounts the panel; returning to Files retains the mounted instance with the existing `hidden` class.

- [ ] **Step 4: Format the modified file**

Run:

```bash
PATH="$HOME/.bun/bin:$PATH" bunx prettier --write apps/desktop/src/app/page.tsx docs/superpowers/plans/2026-07-17-issue-72-lazy-trace.md
```

Expected: both files are formatted with no semantic changes.

### Task 3: Prove the lazy chunk and verify the branch

**Files:**

- Inspect: `apps/desktop/dist/index.html`
- Inspect: `apps/desktop/dist/assets/*`
- Inspect: all changed files through `git diff`

**Interfaces:**

- Consumes: the lazy boundary introduced by Task 2.
- Produces: GREEN build-graph evidence, repository checks, optional real-renderer evidence, and one commit referencing issue #72.

- [x] **Step 1: Build and inspect the production bundle**

Run:

```bash
PATH="$HOME/.bun/bin:$PATH" bun --filter @llm-space/desktop build:view
rg -o 'src="[^"]+\.js"' apps/desktop/dist/index.html
rg -l 'No trace projects|Add trace project|Search remote Langfuse traces' apps/desktop/dist/assets/*.js
```

Expected GREEN: Trace sidebar copy exists in a generated lazy chunk that is not referenced by `index.html`; Vite prints no new chunk warning.

- [x] **Step 2: Run the complete requested verification suite**

Run:

```bash
PATH="$HOME/.bun/bin:$PATH" bun test
PATH="$HOME/.bun/bin:$PATH" bun run lint
PATH="$HOME/.bun/bin:$PATH" bun run typecheck
PATH="$HOME/.bun/bin:$PATH" bun --filter @llm-space/desktop build:view
```

Expected: all four commands exit 0 and the final build emits the same lazy Trace chunk without warnings.

- [x] **Step 3: Verify the real renderer when safe**

Follow `.agents/skills/electrobun-cdp-debug/SKILL.md`, launch with an isolated system-temporary data root, and verify that Trace disabled never exposes or loads the Trace panel, enabling tracing keeps Files as the initial mode, first selection renders Traces, and Files/Traces switching preserves panel state. If the environment cannot safely run CEF/CDP, record the exact unverified behaviors rather than substituting a mocked browser.

Verified through the real Electrobun CEF renderer on 2026-07-18: disabled mode exposed no Traces control or Trace content; enabled mode started in Files without mounting Trace; first Traces selection rendered the empty Trace project state; switching to Files retained the hidden mounted panel and switching back restored it; the renderer console reported no application errors.

- [ ] **Step 4: Self-review and commit**

Run:

```bash
git diff --check
git diff --stat
git diff
git status --short
git add apps/desktop/src/app/page.tsx docs/superpowers/plans/2026-07-17-issue-72-lazy-trace.md
git commit -m "perf: lazy-load trace sidebar (#72)"
git status --short --branch
```

Expected: diff review finds no unrelated changes; commit succeeds; branch is clean and ahead by one commit.
