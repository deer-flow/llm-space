# Thread View Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound mounted Thread views without stopping their sessions, add an On Demand syntax-highlighted editor mode with shared prompt decorations, make two ordinary dropdowns non-modal, and quantify the performance change.

**Architecture:** Keep every open Thread's data loading, Zustand store, run loop, event subscription, and persistence in a headless session component keyed by `paneId`. A pure LRU policy controls only the heavy `ThreadPlayground` view children; evicted views commit drafts before unmount and later rebind to the same store. Repeated editors gain a Lezer-rendered preview that mounts CodeMirror only while focused; declarative editor enhancements compile to viewport-bounded CodeMirror decorations or lightweight Static decorations from one prompt-syntax definition.

**Tech Stack:** TypeScript, React 19, Zustand, TanStack Query, CodeMirror 6, Lezer, Radix UI, Bun test, Electrobun CEF/CDP.

---

## File Map

### New files

- `apps/desktop/src/components/thread-tabs/thread-view-cache-size.ts` — persisted 1–10 cached-view preference and same-window subscription.
- `apps/desktop/src/components/thread-tabs/thread-view-cache-size.test.ts` — validation, fallback, and notification tests.
- `apps/desktop/src/components/thread-tabs/thread-view-lru.ts` — pure MRU/LRU transition logic.
- `apps/desktop/src/components/thread-tabs/thread-view-lru.test.ts` — capacity, activation, Trace exclusion, and eviction tests.
- `apps/desktop/src/components/thread-tabs/use-thread-view-lru.ts` — React adapter that commits panes before eviction.
- `packages/ui/src/components/code-editor/editor-commit-scope.tsx` — optional registry for committing editor drafts owned by one View.
- `packages/ui/src/components/code-editor/static-highlight.ts` — Lezer parsing and highlight-segment generation.
- `packages/ui/src/components/code-editor/static-highlight.test.ts` — Markdown/JSON segment and plain-text fallback tests.
- `packages/ui/src/components/code-editor/on-demand-code-editor.tsx` — focusable highlighted preview and single active editor behavior.
- `packages/ui/src/components/code-editor/editor-enhancement.ts` — CodeMirror-free enhancement contracts, regex factory, and Static decoration collection.
- `packages/ui/src/components/code-editor/editor-enhancement-codemirror.ts` — lazily loaded adapter from visual enhancements to viewport-bounded CodeMirror extensions.
- `packages/ui/src/components/code-editor/editor-enhancement.test.ts` — shared declaration, Static range, and CodeMirror adapter parity tests.
- `packages/ui/src/components/thread-playground/variable/prompt-syntax-enhancements.ts` — prompt-variable and template-tag visual declarations plus CodeMirror-only editing composition.
- `apps/desktop/src/components/code-editor/on-demand-code-editor.test.tsx` — real React pointer, keyboard, blur, readonly, and commit behavior using the repository DOM harness.
- `scripts/thread-view-performance-benchmark.mjs` — isolated fixture, CDP measurement, and JSON result collection.
- `docs/performance/thread-view-performance-2026-08.md` — reproducible baseline/final results and analysis.

### Modified files

- `packages/ui/package.json`, `bun.lock` — add direct `@lezer/highlight` dependency.
- `packages/ui/src/lib/local-storage.ts` — register the cached-view key.
- `packages/ui/src/components/theme-provider.tsx` — accept and persist `on-demand` fidelity.
- `packages/ui/src/components/code-editor/editor.tsx` — register the live `commit()` callback in an optional View scope.
- `packages/ui/src/components/code-editor/index.tsx` — select Full, On Demand, or Fast editor implementation.
- `packages/ui/src/components/thread-playground/variable/prompt-variable-extension.ts` — retain only variable hover, inspection, and prompt autocomplete CodeMirror behavior.
- `packages/ui/src/components/thread-playground/variable/use-prompt-variable-extension.ts` — return stable prompt-syntax enhancements instead of a raw extension array.
- `packages/ui/src/components/thread-playground/thread-playground.tsx` — split Session ownership from disposable View rendering.
- `packages/ui/src/components/thread-playground/message/message-list-item.tsx` — map fidelity to the repeated-editor render mode.
- `packages/ui/src/components/thread-playground/message/tool-call-list-item.tsx` — apply the same mode to repeated tool content.
- `packages/ui/src/components/thread-playground/tool/tool-list-view.tsx` — make Tools Add non-modal.
- `packages/ui/src/components/thread-playground/examples-menu.tsx` — make Examples non-modal.
- `apps/desktop/src/components/settings/general-page.tsx` — add On Demand copy and Cached thread views setting.
- `apps/desktop/src/components/thread-tabs/runtime-pane-host.tsx` — keep session shells mounted while passing a `viewMounted` decision.
- `apps/desktop/src/components/thread-tabs/thread-tab-pane.tsx` — host a persistent Session and conditional View.
- `apps/desktop/src/components/thread-tabs/thread-tabs.tsx` — integrate LRU membership and View commit registration.
- `apps/desktop/src/app/workspace-model-scope.test.tsx` — cover Session survival and View remount with real stores.
- `apps/desktop/src/mainview/index.html` — document that only Fast maps to the pre-React `.lite` class.

## Task 1: Establish a Clean, Repeatable Baseline

**Files:**
- Create: `scripts/thread-view-performance-benchmark.mjs`
- Create: `docs/performance/thread-view-performance-2026-08.md`

- [ ] **Step 1: Align installed dependencies with the lockfile**

Run from the repository root:

```bash
bun install
```

Expected: exit 0; local `radix-ui` and CodeMirror symlinks match `bun.lock`.

- [ ] **Step 2: Write the benchmark harness before feature changes**

The script must implement this orchestration exactly, with each named helper
defined in the same file:

```js
const fixture = await createIsolatedFixture({ threads: 10, messages: 54 });
const app = await launchCef({ home: fixture.home, port: fixture.port });
try {
  await openThreads(10);
  await setRendering("rich");
  const full = await sampleScenario(5);
  await setRendering("lite");
  const fast = await sampleScenario(5);
  await Bun.write(resultPath, JSON.stringify({ commit, full, fast }, null, 2));
} finally {
  await app.stop();
  await fixture.remove();
}
```

`sampleScenario(5)` records DOM nodes, `.cm-editor`, `textarea`, cached tab switch, and click-to-mounted times for Settings, Tools Add, Examples, and Variables. It reports the median and maximum of five samples. It must use generated thread JSON and a temporary `LLM_SPACE_HOME`, never `~/.llm-space`.

- [ ] **Step 3: Run the baseline before production changes**

The implementation branch currently contains only documentation and the
benchmark harness, so its renderer is behaviorally identical to `main`. Record
both `git rev-parse main` as `baseCommit` and `git rev-parse HEAD` as
`benchmarkCommit`; do not switch branches or copy files outside the checkout.

```bash
bun run scripts/thread-view-performance-benchmark.mjs --label baseline --output /tmp/llm-space-thread-view-baseline.json
```

Expected: result JSON includes the tested commit, exact renderer, fixture counts, and five samples per metric.

- [ ] **Step 4: Record the baseline without claiming an improvement**

Add the environment, commits, fixture definition, and raw baseline summary to
`docs/performance/thread-view-performance-2026-08.md`. Create a `Final
comparison` section containing the sentence `Final measurements are added by
Task 10 after the production changes.`; replace that sentence in Task 10.

- [ ] **Step 5: Commit the benchmark foundation**

```bash
git add scripts/thread-view-performance-benchmark.mjs docs/performance/thread-view-performance-2026-08.md
git commit -m "test(perf): add thread view benchmark baseline"
```

## Task 2: Add Validated Rendering and View-cache Preferences

**Files:**
- Create: `apps/desktop/src/components/thread-tabs/thread-view-cache-size.ts`
- Create: `apps/desktop/src/components/thread-tabs/thread-view-cache-size.test.ts`
- Modify: `packages/ui/src/lib/local-storage.ts`
- Modify: `packages/ui/src/components/theme-provider.tsx`
- Modify: `apps/desktop/src/components/settings/general-page.tsx`
- Modify: `apps/desktop/src/mainview/index.html`

- [ ] **Step 1: Write failing preference tests**

Cover this API:

```ts
expect(parseThreadViewCacheSize(null)).toBe(3);
expect(parseThreadViewCacheSize("1")).toBe(1);
expect(parseThreadViewCacheSize("10")).toBe(10);
expect(parseThreadViewCacheSize("0")).toBe(3);
expect(parseThreadViewCacheSize("11")).toBe(3);
expect(parseThreadViewCacheSize("3.5")).toBe(3);
expect(parseThreadViewCacheSize("bad")).toBe(3);
```

Also subscribe two listeners, call `setThreadViewCacheSize(4)`, and assert both receive the same-window update while storage contains `"4"`.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
bun test apps/desktop/src/components/thread-tabs/thread-view-cache-size.test.ts
```

Expected: FAIL because the module and key do not exist.

- [ ] **Step 3: Implement the preference store**

Register `threadViewCacheSize: "llm-space:thread-view-cache-size"` in `LOCAL_STORAGE_KEYS`. Export:

```ts
export const DEFAULT_THREAD_VIEW_CACHE_SIZE = 3;
export const MIN_THREAD_VIEW_CACHE_SIZE = 1;
export const MAX_THREAD_VIEW_CACHE_SIZE = 10;
export function parseThreadViewCacheSize(raw: string | null): number;
export function getThreadViewCacheSize(): number;
export function setThreadViewCacheSize(next: number): void;
export function subscribeThreadViewCacheSize(listener: () => void): () => void;
export function useThreadViewCacheSize(): [number, (next: number) => void];
```

Use `useSyncExternalStore` so General settings and Thread Tabs update in the same window. Clamp only UI-provided values; invalid stored values resolve to 3.

- [ ] **Step 4: Extend rendering fidelity parsing**

Change:

```ts
export type RenderingFidelity = "rich" | "on-demand" | "lite";
```

Make `_readStoredFidelity()` accept all three exact stored values and fall back to `rich`. Keep `_applyFidelity()` toggling `.lite` only for `lite`.

- [ ] **Step 5: Add the settings controls and approved copy**

Add `On Demand` between Full and Fast. Replace the Rendering hint with:

```text
Full keeps every message editor mounted. On Demand shows lightweight syntax highlighting and activates an editor after focus; editing at a specific position may require a second click. Fast uses plain text for the lowest overhead.
```

Add a `Cached thread views` select directly below it with values 1–10 and hint:

```text
Maximum recently used thread views kept mounted. Background sessions keep running after a view is released.
```

- [ ] **Step 6: Verify GREEN and commit**

```bash
bun test apps/desktop/src/components/thread-tabs/thread-view-cache-size.test.ts packages/ui/src/lib/local-storage.test.ts
git add packages/ui/src/lib/local-storage.ts packages/ui/src/components/theme-provider.tsx apps/desktop/src/components/settings/general-page.tsx apps/desktop/src/mainview/index.html apps/desktop/src/components/thread-tabs/thread-view-cache-size.ts apps/desktop/src/components/thread-tabs/thread-view-cache-size.test.ts
git commit -m "feat(settings): configure thread view rendering cache"
```

## Task 3: Implement the Pure Thread-view LRU

**Files:**
- Create: `apps/desktop/src/components/thread-tabs/thread-view-lru.ts`
- Create: `apps/desktop/src/components/thread-tabs/thread-view-lru.test.ts`

- [ ] **Step 1: Write failing LRU tests**

Define the wished-for API:

```ts
const tabs = [thread("a"), trace("trace-1"), thread("b"), thread("c"), thread("d")];

expect(reconcileThreadViewLru([], tabs, "a", 3)).toEqual({
  retained: ["a"],
  evicted: [],
});
expect(reconcileThreadViewLru(["a"], tabs, "b", 3).retained).toEqual(["b", "a"]);
expect(reconcileThreadViewLru(["c", "b", "a"], tabs, "d", 3)).toEqual({
  retained: ["d", "c", "b"],
  evicted: ["a"],
});
```

Add cases for capacity shrink, closed-tab removal, active retention at capacity 1, stable `paneId` after path rename, and a Trace activation leaving Thread recency unchanged.

- [ ] **Step 2: Run and verify RED**

```bash
bun test apps/desktop/src/components/thread-tabs/thread-view-lru.test.ts
```

Expected: FAIL because `reconcileThreadViewLru` does not exist.

- [ ] **Step 3: Implement the pure transition**

Use `paneId` for Thread identity, return MRU-first IDs, remove IDs no longer present, do not add Trace IDs, and return the exact IDs removed from the previous retained set. Do not read storage, React state, run status, or files.

- [ ] **Step 4: Verify GREEN and commit**

```bash
bun test apps/desktop/src/components/thread-tabs/thread-view-lru.test.ts
git add apps/desktop/src/components/thread-tabs/thread-view-lru.ts apps/desktop/src/components/thread-tabs/thread-view-lru.test.ts
git commit -m "feat(tabs): add thread view LRU policy"
```

## Task 4: Split ThreadPlayground Session from View

**Files:**
- Modify: `packages/ui/src/components/thread-playground/thread-playground.tsx`
- Modify: `packages/ui/src/components/thread-playground/index.tsx`
- Modify: `apps/desktop/src/app/workspace-model-scope.test.tsx`

- [ ] **Step 1: Write a failing Session/View lifecycle test**

Extend the existing real-store React harness to mount a Session with its View, capture the store, remove only the View, mutate the store, and remount:

```ts
expect(sessionStoreBefore).toBe(sessionStoreAfter);
expect(viewUnmounts).toBe(1);
expect(sessionUnmounts).toBe(0);
sessionStoreBefore.getState().appendMessage();
expect(remountedMessageCount).toBe(initialMessageCount + 1);
```

Add a transport that yields events while the View is absent and assert status returns to `idle` and the remounted View reads the completed assistant content.

- [ ] **Step 2: Run and verify RED**

```bash
bun test apps/desktop/src/app/workspace-model-scope.test.tsx
```

Expected: FAIL because `ThreadPlaygroundSession` and `ThreadPlaygroundView` are not exported.

- [ ] **Step 3: Extract the Session component**

Export two composable components while retaining the existing facade:

```tsx
<ThreadPlaygroundSession
  initialValue={thread}
  transport={transport}
  runtimeId={runtimeId}
  onChange={onChange}
  onStreamingStart={onStreamingStart}
  onStreamingEnd={onStreamingEnd}
>
  {viewMounted ? <ThreadPlaygroundView {...viewProps} /> : null}
</ThreadPlaygroundSession>
```

`ThreadPlaygroundSession` owns `ProviderProfileSelectionProvider`, the stable store, live provider/default-model refs, runtime tool dependencies, and `useThreadPlaygroundEvents`. `ThreadPlaygroundView` only consumes the existing Store and renders `ThreadPlaygroundContent`. The public `ThreadPlayground` continues to compose both for desktop-independent callers and the web viewer.

- [ ] **Step 4: Preserve intentional store recreation**

Keep `storeKey` semantics by placing the key on `ThreadPlaygroundSession`, not on the disposable View. A refresh recreates the store; an LRU remount does not.

- [ ] **Step 5: Verify GREEN and commit**

```bash
bun test apps/desktop/src/app/workspace-model-scope.test.tsx packages/ui/src/components/thread-playground/stores/thread-store-runtime.test.ts
git add packages/ui/src/components/thread-playground/thread-playground.tsx packages/ui/src/components/thread-playground/index.tsx apps/desktop/src/app/workspace-model-scope.test.tsx
git commit -m "refactor(ui): separate thread sessions from views"
```

## Task 5: Commit Drafts Before LRU Eviction

**Files:**
- Create: `packages/ui/src/components/code-editor/editor-commit-scope.tsx`
- Modify: `packages/ui/src/components/code-editor/editor.tsx`
- Modify: `packages/ui/src/components/code-editor/index.tsx`
- Modify: `packages/ui/src/components/thread-playground/thread-playground.tsx`
- Create: `apps/desktop/src/components/thread-tabs/use-thread-view-lru.ts`
- Modify: `apps/desktop/src/app/workspace-model-scope.test.tsx`

- [ ] **Step 1: Write a failing draft-commit test**

Mount a View commit scope with two registered fake editors, mark one draft dirty, request an LRU transition that evicts the pane, and assert commit happens before unmount:

```ts
expect(events).toEqual(["commit:message-1", "commit:tool-result", "unmount"]);
```

Add a case where no pane is evicted and no commit is requested.

- [ ] **Step 2: Run and verify RED**

```bash
bun test apps/desktop/src/app/workspace-model-scope.test.tsx
```

Expected: FAIL because no commit registry or React LRU adapter exists.

- [ ] **Step 3: Implement the optional editor commit scope**

Provide:

```ts
export interface EditorCommitScopeHandle { commitAll(): void }
export function EditorCommitScope({ children, onReady }: Props): JSX.Element;
export function useRegisterEditorCommit(commit: () => void): void;
```

Each Full and Fast editor registers its stable `commit` callback when a scope is present. Editors elsewhere continue to work with no provider.

- [ ] **Step 4: Implement the React LRU adapter**

`useThreadViewLru({ tabs, activeId, capacity, commitPane })` maintains the MRU list. In a layout effect, compute the next pure transition, synchronously call `commitPane(paneId)` for every eviction, and only then publish the reduced retained set. Avoid side effects inside a React state updater.

- [ ] **Step 5: Expose View commit registration**

Wrap `ThreadPlaygroundView` in `EditorCommitScope` and let `ThreadTabPane` register/unregister `commitAll` by `paneId`. The tab host supplies that callback to `useThreadViewLru`.

- [ ] **Step 6: Verify GREEN and commit**

```bash
bun test apps/desktop/src/app/workspace-model-scope.test.tsx
git add packages/ui/src/components/code-editor/editor-commit-scope.tsx packages/ui/src/components/code-editor/editor.tsx packages/ui/src/components/code-editor/index.tsx packages/ui/src/components/thread-playground/thread-playground.tsx apps/desktop/src/components/thread-tabs/use-thread-view-lru.ts apps/desktop/src/app/workspace-model-scope.test.tsx
git commit -m "feat(tabs): commit drafts before view eviction"
```

## Task 6: Integrate Persistent Sessions with the Desktop LRU

**Files:**
- Modify: `apps/desktop/src/components/thread-tabs/runtime-pane-host.tsx`
- Modify: `apps/desktop/src/components/thread-tabs/thread-tab-pane.tsx`
- Modify: `apps/desktop/src/components/thread-tabs/thread-tabs.tsx`
- Modify: `apps/desktop/src/app/workspace-model-scope.test.tsx`
- Modify: `apps/desktop/src/components/thread-tabs/pane-mutation-actions.test.ts`

- [ ] **Step 1: Write failing integration tests**

Cover these observable behaviors:

```ts
// capacity 3, four visited Thread tabs
expect(mountedThreadViews()).toEqual(["pane-b", "pane-c", "pane-d"]);
expect(mountedThreadSessions()).toEqual(["pane-a", "pane-b", "pane-c", "pane-d"]);

// Trace remains mounted and does not consume capacity
expect(tracePaneMounted("trace-1")).toBe(true);

// running evicted session completes and remounts
expect(session("pane-a").store.getState().status).toBe("idle");
expect(remountedAssistantText("pane-a")).toContain("completed while hidden");
```

Retain the existing assertion that `closeTabIfAllowed` refuses a running pane.

- [ ] **Step 2: Run and verify RED**

```bash
bun test apps/desktop/src/app/workspace-model-scope.test.tsx apps/desktop/src/components/thread-tabs/pane-mutation-actions.test.ts
```

Expected: FAIL because every pane still renders a View.

- [ ] **Step 3: Pass `viewMounted` through the pane host**

Keep every `ThreadTabPane` component mounted as the headless Session shell. Pass `viewMounted={retainedPaneIds.has(tab.paneId)}` only for Thread tabs. Keep Trace rendering unchanged.

- [ ] **Step 4: Make `ThreadTabPane` render Session plus conditional View**

Replace the current single `ThreadPlayground` with the split composition from Task 4. Loading/session hooks, persistence, rename, refresh, compaction, and run leases stay outside the conditional child. Remove the inactive CSS-hidden View path; an unretained Thread renders no playground DOM.

- [ ] **Step 5: Wire the setting and commit registry**

Read `useThreadViewCacheSize()` in `ThreadTabs`, feed it to `useThreadViewLru`, and pass stable commit registration callbacks to each Thread Session. Activation must update recency; rename/move must not because `paneId` is stable.

- [ ] **Step 6: Verify GREEN and commit**

```bash
bun test apps/desktop/src/app/workspace-model-scope.test.tsx apps/desktop/src/components/thread-tabs/pane-mutation-actions.test.ts apps/desktop/src/components/thread-tabs/thread-view-lru.test.ts
git add apps/desktop/src/components/thread-tabs/runtime-pane-host.tsx apps/desktop/src/components/thread-tabs/thread-tab-pane.tsx apps/desktop/src/components/thread-tabs/thread-tabs.tsx apps/desktop/src/app/workspace-model-scope.test.tsx apps/desktop/src/components/thread-tabs/pane-mutation-actions.test.ts
git commit -m "feat(tabs): retain thread sessions with LRU views"
```

## Task 7: Add Lezer Static Highlighting and On Demand Editing

**Files:**
- Modify: `packages/ui/package.json`
- Modify: `bun.lock`
- Create: `packages/ui/src/components/code-editor/static-highlight.ts`
- Create: `packages/ui/src/components/code-editor/static-highlight.test.ts`
- Create: `packages/ui/src/components/code-editor/on-demand-code-editor.tsx`
- Create: `apps/desktop/src/components/code-editor/on-demand-code-editor.test.tsx`
- Modify: `packages/ui/src/components/code-editor/index.tsx`
- Modify: `packages/ui/src/components/thread-playground/message/message-list-item.tsx`
- Modify: `packages/ui/src/components/thread-playground/message/tool-call-list-item.tsx`

- [ ] **Step 1: Add the direct Lezer dependency**

Run inside the UI package:

```bash
bun add @lezer/highlight@1.2.3 --exact
```

Expected: `packages/ui/package.json` and root `bun.lock` change; no duplicate React or CodeMirror versions are introduced.

- [ ] **Step 2: Write failing static-highlight tests**

Define:

```ts
const markdown = createHighlightSegments(
  "**bold** and `code`",
  "markdown",
  "dark"
);
expect(markdown.some((segment) => segment.style != null)).toBe(true);
expect(markdown.map((segment) => segment.text).join("")).toBe("**bold** and `code`");

const json = createHighlightSegments(
  '{"unsafe":"<script>"}',
  "json",
  "dark"
);
expect(json.map((segment) => segment.text).join("")).toBe('{"unsafe":"<script>"}');
```

Add empty text, malformed JSON, multiline Markdown, and classless-gap cases. The helper returns text segments; React performs escaping, and no `dangerouslySetInnerHTML` is permitted.

Using `installReactTestDom()`, also write failing component tests that assert:

```ts
expect(preview.getAttribute("role")).toBe("textbox");
preview.dispatchEvent(new TestEvent("keydown", { key: "Enter" }));
expect(findCodeMirrorEditor()).not.toBeNull();
expect(document.activeElement).toBe(findCodeMirrorEditor());

outside.dispatchEvent(new TestEvent("pointerdown"));
expect(onChangeCalls).toEqual([editedText]);
expect(findHighlightedPreview()).not.toBeNull();
```

Add Space activation, pointer activation, readonly non-activation, activating a
second editor commits the first, and View-scope `commitAll()` cases.

- [ ] **Step 3: Run and verify RED**

```bash
bun test packages/ui/src/components/code-editor/static-highlight.test.ts apps/desktop/src/components/code-editor/on-demand-code-editor.test.tsx
```

Expected: FAIL because `createHighlightSegments` does not exist.

- [ ] **Step 4: Implement Lezer segment generation**

Use `markdownLanguage.parser` and `jsonLanguage.parser` with `highlightTree` and
the same GitHub light/dark `TagStyle` declarations as Full CodeMirror. Resolve
Lezer tags to React-safe inline style objects, fill gaps between highlighted
ranges, and merge adjacent segments with equal styles. Preserve the exact
original text.

- [ ] **Step 5: Implement `OnDemandCodeEditor`**

Preview state renders a focusable, selectable highlighted `<pre>` with the same border, padding, wrapping, max-height, placeholder, readonly opacity, and scroll-on-focus behavior as the existing editor shell. Pointer click, Enter, or Space activates editing. Editing reuses the existing lazy Full editor path, auto-focuses it, and returns to Preview after blur/commit.

Use a View-level active-editor context keyed by editor instance ID so activating one repeated editor commits and deactivates the previous one. View deactivation and LRU eviction call the same commit scope.

- [ ] **Step 6: Route all three fidelity modes**

Replace boolean-only selection with an explicit repeated-editor mode:

```ts
type CodeEditorRenderMode = "full" | "on-demand" | "plain";
```

Map `rich -> full`, `on-demand -> on-demand`, and `lite -> plain` in message and tool-call repeated editors. Do not pass On Demand to System Prompt or other fixed-count editors.

- [ ] **Step 7: Verify GREEN and commit**

```bash
bun test packages/ui/src/components/code-editor/static-highlight.test.ts apps/desktop/src/components/code-editor/on-demand-code-editor.test.tsx apps/desktop/src/app/workspace-model-scope.test.tsx
git add packages/ui/package.json bun.lock packages/ui/src/components/code-editor/static-highlight.ts packages/ui/src/components/code-editor/static-highlight.test.ts packages/ui/src/components/code-editor/on-demand-code-editor.tsx apps/desktop/src/components/code-editor/on-demand-code-editor.test.tsx packages/ui/src/components/code-editor/index.tsx packages/ui/src/components/thread-playground/message/message-list-item.tsx packages/ui/src/components/thread-playground/message/tool-call-list-item.tsx
git commit -m "feat(ui): add on-demand highlighted editors"
```

## Task 8: Unify Prompt Highlighting Through Editor Enhancements

**Files:**
- Create: `packages/ui/src/components/code-editor/editor-enhancement.ts`
- Create: `packages/ui/src/components/code-editor/editor-enhancement-codemirror.ts`
- Create: `packages/ui/src/components/code-editor/editor-enhancement.test.ts`
- Create: `packages/ui/src/components/thread-playground/variable/prompt-syntax-enhancements.ts`
- Modify: `packages/ui/src/components/code-editor/editor.tsx`
- Modify: `packages/ui/src/components/code-editor/index.tsx`
- Modify: `packages/ui/src/components/code-editor/on-demand-code-editor.tsx`
- Modify: `packages/ui/src/components/code-editor/static-highlight.ts`
- Modify: `packages/ui/src/components/code-editor/static-highlight.test.ts`
- Modify: `packages/ui/src/components/thread-playground/variable/prompt-variable-extension.ts`
- Modify: `packages/ui/src/components/thread-playground/variable/use-prompt-variable-extension.ts`
- Modify: `packages/ui/src/components/thread-playground/message/message-list-item.tsx`
- Modify: `packages/ui/src/components/thread-playground/message/tool-call-list-item.tsx`
- Modify: `packages/ui/src/components/thread-playground/prompt/system-prompt-editor.tsx`
- Modify: `apps/desktop/src/components/code-editor/on-demand-code-editor.test.tsx`
- Delete: `packages/ui/src/components/code-editor/prompt-template-highlights.ts`

- [ ] **Step 1: Write failing pure enhancement and parity tests**

Define the expected public contract in `editor-enhancement.test.ts` before the
module exists:

```ts
const variable = createRegexHighlightEnhancement({
  id: "prompt-variable-highlight",
  pattern: String.raw`\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}`,
  className: "cm-prompt-variable",
  style: { color: "var(--cm-variable)", fontWeight: "500" },
  priority: 10,
});
const tag = createRegexHighlightEnhancement({
  id: "prompt-template-tag-highlight",
  pattern: String.raw`\{%[-+]?[\s\S]*?[-+]?%\}`,
  className: "cm-template-tag",
  style: { color: "var(--cm-template-tag)", fontWeight: "500" },
  priority: 20,
});

expect(collectStaticDecorations("{{ name }} {% if ok %}", [variable, tag]))
  .toEqual([
    { from: 0, to: 10, style: variable.style, priority: 10 },
    { from: 11, to: 22, style: tag.style, priority: 20 },
  ]);
expect(compileCodeMirrorEnhancements([variable, tag])).toHaveLength(4);
```

Add cases for multiline tags, repeated variables, no matches, deterministic
ordering, stable compilation for the same enhancement identity, duplicate IDs,
an immutable `range-highlight` declaration, and a `code-mirror-only`
enhancement contributing extensions but no Static decorations. Mount a Full
editor in the existing DOM harness and assert its DOM contains both
`.cm-prompt-variable` and `.cm-template-tag` marks.

Extend `static-highlight.test.ts` and the On Demand component test with
`{{current_date}}\n{% if enabled %}`. Assert Preview reconstructs the exact
source, applies the declared variable/tag colors, mounts no `.cm-editor`, and
after activation mounts CodeMirror with both mark classes.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
bun test packages/ui/src/components/code-editor/editor-enhancement.test.ts packages/ui/src/components/code-editor/static-highlight.test.ts apps/desktop/src/components/code-editor/on-demand-code-editor.test.tsx
```

Expected: FAIL because `editor-enhancement.ts`, its CodeMirror adapter, and the
`enhancements` CodeEditor prop do not exist.

- [ ] **Step 3: Implement the CodeMirror-free enhancement contract**

Create `editor-enhancement.ts` without a runtime import from any
`@codemirror/*` package:

```ts
import type { Extension } from "@codemirror/state";
import type { CSSProperties } from "react";

export interface RegexHighlightEnhancement {
  kind: "regex-highlight";
  id: string;
  pattern: string;
  className: string;
  style: Readonly<CSSProperties>;
  priority: number;
}

export interface CodeMirrorOnlyEnhancement {
  kind: "code-mirror-only";
  id: string;
  extensions: readonly Extension[];
}

export interface RangeHighlightEnhancement {
  kind: "range-highlight";
  id: string;
  className: string;
  style: Readonly<CSSProperties>;
  priority: number;
  getRanges(source: string): readonly { from: number; to: number }[];
}

export type EditorEnhancement =
  | RegexHighlightEnhancement
  | RangeHighlightEnhancement
  | CodeMirrorOnlyEnhancement;

export interface StaticDecorationRange {
  from: number;
  to: number;
  style: Readonly<CSSProperties>;
  priority: number;
}
```

Export `createRegexHighlightEnhancement()`,
`createRangeHighlightEnhancement()`, and
`collectStaticDecorations(source, enhancements)`. The regex factory rejects an
empty ID, a pattern that does not compile, and patterns that match an empty
string. The range factory rejects an empty ID and evaluates its provider against
the current source in each backend. The collector creates a fresh global RegExp
per regex scan, obtains explicit ranges from range providers, ignores
CodeMirror-only enhancements, clamps ranges to the source, drops empty ranges,
and sorts by `from`, then `priority`, then `to`. Duplicate enhancement IDs
always throw so composition failures are visible.

- [ ] **Step 4: Implement the lazy CodeMirror adapter**

Create `editor-enhancement-codemirror.ts` and keep all runtime CodeMirror
imports in this module. Export:

```ts
export function compileCodeMirrorEnhancements(
  enhancements: readonly EditorEnhancement[]
): Extension[];
```

Compile every regex highlight into one viewport-bounded `MatchDecorator` /
`ViewPlugin` extension plus one `EditorView.theme` extension using its declared
class and style. Compile a range highlight into a `ViewPlugin` that obtains
ranges from the current document on creation and `docChanged`, plus the same
theme adapter; clamp and sort its `DecorationSet`. Flatten CodeMirror-only
extension arrays unchanged. Cache each compiled pair in a
`WeakMap<RegexHighlightEnhancement | RangeHighlightEnhancement, Extension[]>`
so a stable enhancement object produces stable extension identity and does not
reconfigure an active editor.

Do not make Full CodeMirror consume `collectStaticDecorations()`; that would
replace its viewport-bounded work with a whole-document scan.

- [ ] **Step 5: Make Static Highlighting consume generic decorations**

Remove `StaticHighlightOptions.highlightPromptTemplates` and all prompt-specific
imports from `static-highlight.ts`. Change the API to:

```ts
export function createHighlightSegments(
  source: string,
  language: HighlightLanguage,
  theme: ResolvedTheme,
  enhancements: readonly EditorEnhancement[] = []
): HighlightSegment[];
```

Call `collectStaticDecorations(source, enhancements)` and merge those ranges
with Lezer ranges using the existing boundary algorithm. Higher numeric
priority wins when visual ranges overlap; syntax color remains the fallback for
properties that an overlay does not define. Memoization in
`OnDemandCodeEditor` depends on value, language, resolved theme, streaming, and
the stable enhancement-array identity.

- [ ] **Step 6: Route enhancements through the CodeEditor facade**

Replace `highlightPromptTemplates` in `CodeEditorProps` with:

```ts
enhancements?: readonly EditorEnhancement[];
```

Keep `extraExtensions?: Extension[]` as a documented CodeMirror-only escape
hatch for existing internal callers such as citations. In `editor.tsx`, append
`compileCodeMirrorEnhancements(enhancements ?? [])` before `extraExtensions`.
Plain mode ignores enhancements. On Demand preview passes enhancements to
`createHighlightSegments`; when activated, it passes the same enhancements to
the injected Full editor. Streaming preview continues returning unhighlighted
text segments.

- [ ] **Step 7: Declare prompt syntax once and separate editor interactions**

Create `prompt-syntax-enhancements.ts` with two module-stable visual values:

```ts
export const PROMPT_VARIABLE_HIGHLIGHT =
  createRegexHighlightEnhancement({
    id: "prompt-variable-highlight",
    pattern: PROMPT_VARIABLE_PATTERN,
    className: "cm-prompt-variable",
    style: PROMPT_VARIABLE_STYLE,
    priority: 10,
  });

export const PROMPT_TEMPLATE_TAG_HIGHLIGHT =
  createRegexHighlightEnhancement({
    id: "prompt-template-tag-highlight",
    pattern: PROMPT_TEMPLATE_TAG_PATTERN,
    className: "cm-template-tag",
    style: PROMPT_TEMPLATE_TAG_STYLE,
    priority: 20,
  });
```

Move the patterns and styles out of the generic code-editor directory into this
prompt feature module. Delete the intermediate
`code-editor/prompt-template-highlights.ts` file.

Remove `placeholderHighlighter`, `templateTagHighlighter`, and their two visual
theme rules from `prompt-variable-extension.ts`. Keep variable hover and
inspection, variable selection, `@include` completion, template-tag completion,
tooltip placement, and interactive tooltip/completion styles. Wrap its result:

```ts
export function createPromptSyntaxEditingEnhancement(options): EditorEnhancement {
  return {
    kind: "code-mirror-only",
    id: "prompt-syntax-editing",
    extensions: createPromptVariableEditingExtensions(options),
  };
}
```

- [ ] **Step 8: Return stable enhancements from the prompt hook and migrate callers**

Change the prompt hook to return:

```ts
[
  PROMPT_VARIABLE_HIGHLIGHT,
  PROMPT_TEMPLATE_TAG_HIGHLIGHT,
  editingEnhancement,
]
```

Retain the existing `WeakMap<ThreadStore, Map<string, ...>>` keyed by Store and
prompt place, but cache the complete stable enhancement array. Snapshot context
continues using its frozen resolver and has no inspect action. Outside a Thread
context, return the same stable empty array so prompt syntax is not enabled
accidentally.

Migrate message text, tool response, and System Prompt call sites from
`extraExtensions={variableExtension}` plus `highlightPromptTemplates` to
`enhancements={promptSyntaxEnhancements}`. Message citations remain in
`extraExtensions` in this change; exposing clickable Static decorations is a
separate interaction design.

- [ ] **Step 9: Verify prompt editing features did not regress**

Run the focused tests and add DOM assertions after On Demand activation for:

```text
{{              -> variable list plus @include
{{@             -> @include completion
{%              -> if/elif/else/endif/for/endfor/set/raw/endraw completion
hover {{name}}  -> current value tooltip and inspect action in live threads
```

Static Preview must have no CodeMirror tooltip, completion list, variable
resolver call, skill load, or inspect action. Full and activated On Demand must
retain all existing behavior.

```bash
bun test packages/ui/src/components/code-editor/editor-enhancement.test.ts packages/ui/src/components/code-editor/static-highlight.test.ts apps/desktop/src/components/code-editor/on-demand-code-editor.test.tsx packages/ui/src/components/thread-playground/variable
```

Expected: PASS.

- [ ] **Step 10: Commit the enhancement refactor**

```bash
git add packages/ui/src/components/code-editor packages/ui/src/components/thread-playground/variable packages/ui/src/components/thread-playground/message/message-list-item.tsx packages/ui/src/components/thread-playground/message/tool-call-list-item.tsx packages/ui/src/components/thread-playground/prompt/system-prompt-editor.tsx apps/desktop/src/components/code-editor/on-demand-code-editor.test.tsx
git commit -m "refactor(ui): unify editor highlight enhancements"
```

## Task 9: Make Ordinary Dropdowns Non-modal Without Interaction Regressions

**Files:**
- Modify: `packages/ui/src/components/thread-playground/tool/tool-list-view.tsx`
- Modify: `packages/ui/src/components/thread-playground/examples-menu.tsx`
- Modify: `scripts/thread-view-performance-benchmark.mjs`

- [ ] **Step 1: Add failing policy assertions to the benchmark smoke phase**

Before changing components, have the CDP smoke phase open each target menu by pointer and keyboard and record:

```json
{
  "toolsAdd": { "opens": true, "escapeRestoresTrigger": true, "dialogOwnsFocus": true },
  "examples": { "opens": true, "arrowSelects": true, "outsideDismisses": true }
}
```

Also assert the open menu does not set `aria-hidden="true"` on the application root and does not leave `body` scroll-locked. Against current modal menus, the non-modal policy assertion must fail for the expected reason.

- [ ] **Step 2: Run and verify RED**

```bash
bun run scripts/thread-view-performance-benchmark.mjs --smoke dropdowns
```

Expected: FAIL on the non-modal background-isolation assertion.

- [ ] **Step 3: Set only the approved menus non-modal**

Change exactly these roots:

```tsx
<DropdownMenu modal={false}>
```

Do not change More Actions, Run Settings, ContextMenu, Settings, Variables, New Thread, or confirmation dialogs.

- [ ] **Step 4: Handle menu-to-Dialog focus only if the smoke test exposes a race**

If Radix restores focus to the trigger after a selected Tools item opens a Dialog, prevent that menu close's auto-focus and allow the Dialog to own focus. Keep outside-click and Escape focus restoration unchanged.

- [ ] **Step 5: Verify GREEN and commit**

```bash
bun run scripts/thread-view-performance-benchmark.mjs --smoke dropdowns
git add packages/ui/src/components/thread-playground/tool/tool-list-view.tsx packages/ui/src/components/thread-playground/examples-menu.tsx scripts/thread-view-performance-benchmark.mjs
git commit -m "perf(ui): make ordinary dropdown menus non-modal"
```

## Task 10: Full Verification and Before/After Benchmark

**Files:**
- Modify: `docs/performance/thread-view-performance-2026-08.md`

- [ ] **Step 1: Run focused lifecycle and rendering tests**

```bash
bun test apps/desktop/src/components/thread-tabs/thread-view-cache-size.test.ts apps/desktop/src/components/thread-tabs/thread-view-lru.test.ts apps/desktop/src/app/workspace-model-scope.test.tsx apps/desktop/src/components/code-editor/on-demand-code-editor.test.tsx packages/ui/src/components/code-editor/editor-enhancement.test.ts packages/ui/src/components/code-editor/static-highlight.test.ts packages/ui/src/components/thread-playground/variable packages/ui/src/lib/local-storage.test.ts
```

Expected: all focused tests pass with zero failures.

- [ ] **Step 2: Run the complete repository verification**

```bash
mise run test
mise run lint
mise run typecheck
mise run build:canary
```

Expected: every command exits 0; lint reports zero warnings and errors.

- [ ] **Step 3: Run the final benchmark**

```bash
bun run scripts/thread-view-performance-benchmark.mjs --label final --output /tmp/llm-space-thread-view-final.json
```

Expected: JSON includes Full, On Demand, and Fast; one active long Thread and ten-open-Thread/LRU-3 scenarios; cached and evicted switch timings; overlay timings; DOM/editor counts; and the background-session continuation check.

- [ ] **Step 4: Write the comparison analysis**

Replace the Task 1 final-measurements sentence with:

- exact baseline and final commits;
- machine, renderer, dependency, fixture, and sample-count details;
- median and maximum tables;
- percentage change for DOM, CodeMirror, overlay latency, and scrolling;
- cached switch versus evicted remount trade-off;
- proof that an evicted Session completed and remounted with full output;
- remaining active-long-thread bottlenecks and whether message virtualization is still warranted.

Do not claim improvement for noisy or regressed metrics; report them as measured.

- [ ] **Step 5: Re-run diff and repository checks after documentation**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intended files are modified.

- [ ] **Step 6: Commit the benchmark report**

```bash
git add docs/performance/thread-view-performance-2026-08.md
git commit -m "docs(perf): compare thread view rendering performance"
```

## Plan Self-review Checklist

- Every design requirement maps to a task: Session/View split (Tasks 4–6), LRU setting and policy (Tasks 2–3), draft safety (Task 5), On Demand and approved copy (Task 7), unified prompt highlight enhancements and CodeMirror-only interactions (Task 8), non-modal menus (Task 9), benchmark and analysis (Tasks 1 and 10).
- Trace exclusion is explicit in Tasks 3 and 6.
- Running-tab close protection is explicitly retained and retested in Task 6.
- Baseline is measured before production changes and final results use the same harness.
- No task depends on a worktree; all commands run in the current checkout and current branch.
