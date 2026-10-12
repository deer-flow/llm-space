# Thread View Performance Fusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fuse the branch's On Demand rendering and configurable View cache
with main's Thread/Trace View retention and message virtualization, while
preserving sessions, drafts, focus, scroll anchors, and ordinary-menu behavior.

**Architecture:** `RuntimePaneHost` becomes the only Thread/Trace View LRU,
while each pane's Session shell remains mounted. Message rendering,
message-list virtualization, and View cache size remain independent preferences.
A focused virtualization provider consumes the existing rendering preference
only to calculate Auto's effective threshold. Auto uses a startup physical
memory tier, rendering multipliers, and hard bounds; scroll restoration stores
only a stable bottom-anchor message ID.

**Tech Stack:** React 19, TypeScript, Zustand, TanStack Virtual, CodeMirror 6,
Lezer, Electrobun typed RPC, Bun tests, CEF/CDP benchmark harness.

**Execution constraints:** Work in the current checkout and current branch. Do
not create a worktree. Keep all implementation changes uncommitted until the
user explicitly authorizes a commit.

---

## File map

- `packages/ui/src/components/message-virtualization-provider.tsx` — persisted
  Virtualization preferences plus the current rendering-aware Auto threshold.
- `packages/ui/src/components/thread-playground/message/message-virtualization-policy.ts`
  — pure mode parsing, memory tiers, multipliers, bounds, and row-count decision.
- `packages/ui/src/components/thread-playground/message/message-list-view.tsx`
  — applies the selected virtualization policy and restores a bottom message
  anchor in virtual and non-virtual modes.
- `packages/ui/src/lib/local-storage.ts` — preference key registry.
- `apps/desktop/src/shared/rpc.ts` and `apps/desktop/src/bun/rpc/index.ts` —
  expose local total physical memory to the renderer.
- `apps/desktop/src/mainview/main.tsx`, `apps/desktop/src/app/index.tsx`, and
  `apps/desktop/src/app/layout.tsx` — load physical memory before React mounts
  and provide the Virtualization context.
- `apps/web/src/app.tsx` — installs the same provider with its documented
  standard-memory fallback for the display-only web viewer.
- `apps/desktop/src/components/settings/general-page.tsx` — Appearance and
  Performance sections and the three approved setting labels.
- `apps/desktop/src/components/thread-tabs/runtime-pane-host.tsx` and
  `retain-recent-pane-keys.ts` — one commit-before-evict LRU for Thread and Trace.
- `apps/desktop/src/components/thread-tabs/view-cache-size.ts` — persisted
  generic View cache size and migration from the branch's old key.
- `apps/desktop/src/components/thread-tabs/thread-tabs.tsx`,
  `thread-tab-pane.tsx`, `trace-tab-pane.tsx`, and `apps/desktop/src/app/page.tsx`
  — generic draft commit registration and transient scroll snapshots.
- `scripts/thread-view-performance-benchmark.mjs` and
  `docs/performance/thread-view-performance-2026-08.md` — scaling benchmark,
  calibrated memory-tier values, and before/after evidence.

## Task 1: Add the pure virtualization policy

**Files:**

- Create: `packages/ui/src/components/thread-playground/message/message-virtualization-policy.ts`
- Create: `packages/ui/tests/components/thread-playground/message/message-virtualization-policy.test.ts`

- [ ] **Step 1: Write failing parsing and decision tests**

Cover all four modes, invalid persistence, strict threshold comparison, the
rendering multipliers, and hard Auto bounds:

```ts
expect(parseMessageVirtualizationMode(null)).toBe("auto");
expect(parseMessageVirtualizationMode("invalid")).toBe("auto");
expect(parseCustomVirtualizationThreshold(null)).toBe(20);

expect(resolveAutoVirtualizationThreshold({
  totalMemoryBytes: 16 * GIB,
  rendering: "rich",
})).toBe(15);
expect(resolveAutoVirtualizationThreshold({
  totalMemoryBytes: 16 * GIB,
  rendering: "on-demand",
})).toBe(23);
expect(applyRenderingThreshold({
  fullBaseThreshold: 120,
  rendering: "lite",
})).toBe(200);

expect(shouldVirtualizeMessages({ mode: "off", rowCount: 500 })).toBe(false);
expect(shouldVirtualizeMessages({ mode: "on", rowCount: 1 })).toBe(true);
expect(shouldVirtualizeMessages({
  mode: "custom",
  customThreshold: 20,
  rowCount: 20,
})).toBe(false);
expect(shouldVirtualizeMessages({
  mode: "custom",
  customThreshold: 20,
  rowCount: 21,
})).toBe(true);
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

```bash
bun test packages/ui/tests/components/thread-playground/message/message-virtualization-policy.test.ts
```

Expected: fail because the policy module does not exist.

- [ ] **Step 3: Implement the pure contract**

```ts
export type MessageVirtualizationMode = "off" | "auto" | "custom" | "on";

export const DEFAULT_MESSAGE_VIRTUALIZATION_MODE = "auto";
export const DEFAULT_CUSTOM_VIRTUALIZATION_THRESHOLD = 20;
export const MIN_AUTO_VIRTUALIZATION_THRESHOLD = 10;
export const MAX_AUTO_VIRTUALIZATION_THRESHOLD = 200;
export const RENDERING_THRESHOLD_MULTIPLIER = {
  rich: 1,
  "on-demand": 1.5,
  lite: 2,
} as const;
```

Use nominal GiB buckets after rounding `totalMemoryBytes / 2 ** 30`. Benchmark
calibration finalized Full baselines at 10 for at most 8 GiB, 15 for at most 16
GiB, 25 for at most 32 GiB, and 30 above 32 GiB. Keep the confirmed modes,
multipliers, and 10-200 bounds.

- [ ] **Step 4: Run the focused test**

Expected: all policy assertions pass.

## Task 2: Persist Virtualization preferences in a focused provider

**Files:**

- Create: `packages/ui/src/components/message-virtualization-provider.tsx`
- Create: `packages/ui/tests/components/message-virtualization-provider.test.tsx`
- Modify: `packages/ui/src/lib/local-storage.ts`

- [ ] **Step 1: Register persistence keys and write provider tests**

Add keys for `messageVirtualizationMode` and
`customVirtualizationThreshold`. Test defaults, persistence, invalid fallback,
re-entering Auto, and rendering-dependent effective thresholds.

```ts
interface MessageVirtualizationContextValue {
  virtualization: MessageVirtualizationMode;
  setVirtualization(next: MessageVirtualizationMode): void;
  customThreshold: number;
  setCustomThreshold(next: number): void;
  autoThreshold: number;
  shouldVirtualize(rowCount: number): boolean;
}

export function MessageVirtualizationProvider({
  children,
  totalMemoryBytes,
}: {
  children: ReactNode;
  totalMemoryBytes: number | null;
}) {}
```

The provider consumes the existing `useRenderingFidelity()` context but does
not take ownership of Message rendering. When `totalMemoryBytes` is unavailable,
use the 16-GiB tier. Entering Auto re-evaluates the memory bucket once. Changing
rendering recomputes the effective threshold without rereading system memory.

- [ ] **Step 2: Run the provider test and verify failure**

```bash
bun test packages/ui/tests/components/message-virtualization-provider.test.tsx
```

Expected: fail because the provider and storage keys do not exist.

- [ ] **Step 3: Implement virtualization state and selector isolation**

Keep the new context separate from `ThemeProvider`. `MessageListView` subscribes
to the virtualization decision; repeated message items continue subscribing
only to rendering. Changing Custom threshold must not rerender every row.

- [ ] **Step 4: Wrap the provider test and rerun it**

```bash
bun test packages/ui/tests/components/message-virtualization-provider.test.tsx
```

Expected: all preference and rendering-multiplier assertions pass; existing
Full/On Demand/Fast ownership remains unchanged in `ThemeProvider`.

## Task 3: Supply total physical memory through the desktop boundary

**Files:**

- Modify: `apps/desktop/src/shared/rpc.ts`
- Modify: `apps/desktop/src/bun/rpc/index.ts`
- Create: `apps/desktop/src/bun/rpc/system-info.ts`
- Create: `apps/desktop/src/bun/rpc/system-info.test.ts`
- Modify: `apps/desktop/src/mainview/main.tsx`
- Modify: `apps/desktop/src/app/index.tsx`
- Modify: `apps/desktop/src/app/layout.tsx`
- Modify: `apps/web/src/app.tsx`

- [ ] **Step 1: Add a failing RPC contract assertion**

```ts
systemInfo: {
  params: Record<string, never>;
  response: { totalMemoryBytes: number };
};
```

Test the pure response builder with an injected total-memory reader and assert
that it returns a finite positive integer:

```ts
expect(readSystemInfo(() => 32 * 2 ** 30)).toEqual({
  totalMemoryBytes: 32 * 2 ** 30,
});
```

- [ ] **Step 2: Implement the Bun handler**

In `system-info.ts`, import `totalmem` from `node:os` and expose a testable
builder. Register it in the RPC handler:

```ts
systemInfo: () =>
  Promise.resolve(readSystemInfo()),
```

Do not use remote-runtime memory and do not expose free-memory polling.

- [ ] **Step 3: Load the value before mounting React**

In `startRenderer()`, request `systemInfo` alongside local-storage hydration,
catch failure independently, and pass `number | null` through `App` and
`Layout` into `MessageVirtualizationProvider`. Failure uses the provider's standard
16-GiB fallback and must not block startup.

- [ ] **Step 4: Install the provider in the web app**

Wrap the web tree with `MessageVirtualizationProvider totalMemoryBytes={null}`.
Place it inside `ThemeProvider` so it can consume Message rendering. The
display-only viewer uses the standard tier without importing Electrobun or
server code.

- [ ] **Step 5: Run changed-file type checking**

```bash
bun run typecheck:changed
```

Expected: no diagnostics in the changed RPC/provider wiring.

## Task 4: Rebuild General settings around Performance

**Files:**

- Modify: `apps/desktop/src/components/settings/general-page.tsx`
- Move: `apps/desktop/src/components/thread-tabs/thread-view-cache-size.ts` to
  `apps/desktop/src/components/thread-tabs/view-cache-size.ts`
- Move: `apps/desktop/src/components/thread-tabs/thread-view-cache-size.test.ts`
  to `apps/desktop/src/components/thread-tabs/view-cache-size.test.ts`
- Modify: `packages/ui/src/lib/local-storage.ts`
- Modify: `docs/settings.md`

- [ ] **Step 1: Rename the View cache preference and preserve local data**

Export `useViewCacheSize`, `DEFAULT_VIEW_CACHE_SIZE = 3`, minimum 1, and maximum
10. Read the new `viewCacheSize` key first, then the legacy
`threadViewCacheSize` key. On first write, store the new key and remove the old
key. Test new-key precedence, legacy fallback, invalid input, and clamping.

- [ ] **Step 2: Move the three rows into a Performance section**

Keep Language, Theme, and Primary color under Appearance. Add:

```text
Message rendering  Full | On Demand | Fast
Virtualization     Off | Auto | Custom | On
View cache         1 .. 10
```

Auto shows `Current threshold: N messages` plus memory tier and rendering
multiplier. Custom shows a positive-integer input; invalid or empty persisted
values resolve to 20.

- [ ] **Step 3: Preserve approved explanatory copy**

Message rendering states that On Demand uses static syntax highlighting and
requires focus before editing, so caret placement may require a second click.
Virtualization states that it reduces mounted rows but fast scrolling can
briefly show blank space. View cache states that released Views do not stop
background sessions.

- [ ] **Step 4: Run focused preference tests**

```bash
bun test apps/desktop/src/components/thread-tabs/view-cache-size.test.ts \
  packages/ui/tests/components/message-virtualization-provider.test.tsx
```

Expected: all parsing, migration, and update assertions pass.

## Task 5: Fuse Thread and Trace View retention into RuntimePaneHost

**Files:**

- Modify: `apps/desktop/src/components/thread-tabs/retain-recent-pane-keys.ts`
- Modify: `apps/desktop/src/components/thread-tabs/retain-recent-pane-keys.test.ts`
- Modify: `apps/desktop/src/components/thread-tabs/runtime-pane-host.tsx`
- Modify: `apps/desktop/src/components/thread-tabs/thread-tabs.tsx`
- Delete: `apps/desktop/src/components/thread-tabs/use-thread-view-lru.ts`
- Delete: `apps/desktop/src/components/thread-tabs/thread-view-lru.ts`
- Delete: `apps/desktop/src/components/thread-tabs/thread-view-lru.test.ts`
- Modify: `apps/desktop/src/app/workspace-model-scope.test.tsx`

- [ ] **Step 1: Add reconciliation tests with explicit evictions**

```ts
expect(reconcileRecentPaneKeys({
  previousKeys: ["trace-a", "thread-b", "thread-c"],
  availableKeys: ["trace-a", "thread-b", "thread-c", "trace-d"],
  activeKey: "trace-d",
  limit: 3,
})).toEqual({
  retained: ["trace-d", "trace-a", "thread-b"],
  evicted: ["thread-c"],
});
```

Also cover capacity shrink, removed tabs, active retention, and default 3.

- [ ] **Step 2: Commit before changing mounted state**

Add `onBeforeViewUnmount?: (paneKey: string) => void` to `RuntimePaneHost`.
Keep mounted keys in state. In a layout effect, compute the transition, call
the callback for each evicted key while its View is mounted, then install the
new list. Initialize state with the active key so startup does not mount
unrelated tabs.

- [ ] **Step 3: Remove the nested Thread-only LRU**

Pass configured `viewCacheSize` and the generic commit callback to
`RuntimePaneHost`. Pass `viewMounted` unchanged to `ThreadTabPane` and
`TraceTabPane`. Remove the duplicate Thread-only hook and pure policy.

- [ ] **Step 4: Verify unified retention**

Extend the workspace test to open interleaved Thread and Trace tabs, activate
four panes with cache size three, and assert exactly three Views remain mounted
while all four Session shells still exist.

- [ ] **Step 5: Run focused LRU tests**

```bash
bun test apps/desktop/src/components/thread-tabs/retain-recent-pane-keys.test.ts \
  apps/desktop/src/app/workspace-model-scope.test.tsx
```

Expected: Thread and Trace share one capacity and eviction callbacks run before
the corresponding View disappears.

## Task 6: Make draft commit and scroll state generic

**Files:**

- Modify: `apps/desktop/src/app/page.tsx`
- Modify: `apps/desktop/src/components/thread-tabs/thread-tabs.tsx`
- Modify: `apps/desktop/src/components/thread-tabs/thread-tab-pane.tsx`
- Modify: `apps/desktop/src/components/thread-tabs/trace-tab-pane.tsx`
- Modify: `apps/desktop/src/components/thread-tabs/pane-mutation-actions.test.ts`
- Modify: `apps/desktop/src/app/workspace-model-scope.test.tsx`

- [ ] **Step 1: Add a failing Trace draft-eviction test**

Mount an editable Trace View, type without blur, activate enough other tabs to
evict it, and assert that the Trace Store and serialized persistence receive
the final draft before unmount. Repeat close and Close All through the
reservation-aware mutation path.

- [ ] **Step 2: Generalize the commit registry**

Rename page-level `threadViewCommitHandles` and `commitThreadView(s)` to
`viewCommitHandles` and `commitView(s)`. Key entries with `paneIdForTab(tab)`.
`commitViews(closingTabs)` commits both Thread and Trace before persistence
cleanup.

- [ ] **Step 3: Register the Trace commit scope**

Pass `onEditorCommitScopeReady` through `TraceTabPane` into
`ThreadPlayground`. Unregister on View unmount. Keep owner-aware close
reservation behavior so the closing transaction's own commit reaches
persistence while unrelated writes remain blocked.

- [ ] **Step 4: Give Trace the same transient scroll owner**

Keep `ThreadScrollSnapshot | null` in each mounted pane Session shell, not a
global Store or persisted JSON. Pass `initialScrollSnapshot` and
`onScrollSnapshotChange` for Thread and Trace.

- [ ] **Step 5: Run lifecycle tests**

```bash
bun test apps/desktop/src/components/thread-tabs/pane-mutation-actions.test.ts \
  apps/desktop/src/app/workspace-model-scope.test.tsx
```

Expected: no Full, On Demand, or Fast draft is lost; evicted running Thread and
Trace sessions complete; running-tab close prohibition remains.

## Task 7: Apply configurable virtualization and message-ID restoration

**Files:**

- Modify: `packages/ui/src/components/thread-playground/message/message-list-view.tsx`
- Modify: `packages/ui/tests/components/thread-playground/message/message-list-view-scroll.test.ts`
- Modify: `packages/ui/src/components/thread-playground/thread-playground.tsx`
- Modify: `packages/ui/src/components/thread-playground/index.ts`

- [ ] **Step 1: Replace pixel snapshots with a message ID**

```ts
export interface ThreadScrollSnapshot {
  messageId: string;
}
```

Test that capture chooses the bottom-most visible message, including a tall row
that spans the viewport. Test background appends by resolving the ID against a
new `displayMessages` array whose index changed.

- [ ] **Step 2: Test both restore backends**

Virtual assertion:

```ts
expect(scrollToIndex).toHaveBeenCalledWith(updatedIndex, {
  align: "end",
  behavior: "auto",
});
```

For non-virtual mode, assert that only the message-list viewport moves by
`rowRect.bottom - viewportRect.bottom`. A missing ID scrolls to `scrollHeight`.
A pending `pendingAutoFocusMessageId` prevents restoration.

- [ ] **Step 3: Replace the fixed threshold**

Remove `MESSAGE_VIRTUALIZATION_THRESHOLD`. Read the decision from the focused
Virtualization provider using `displayRows.length`. Preserve TanStack's height
cache, item keys, measurement function, and overscan.

- [ ] **Step 4: Restore after remount and explicit layout switches**

Capture on active-to-inactive cleanup before hiding. Retained Views preserve
native scroll state. Evicted remounts resolve the ID and use virtual or DOM end
alignment. When Message rendering or Virtualization changes while active,
capture before replacing list layout and restore after the new backend mounts.
Because TanStack Virtual writes container height and row transforms directly,
the non-virtual branch explicitly resets `height`, `transform`, `top`, and
`left`. Keep the same message keys and component instances so this transition
does not discard editor-local drafts.

- [ ] **Step 5: Run focused message tests**

```bash
bun test packages/ui/tests/components/thread-playground/message/message-list-view-scroll.test.ts \
  packages/ui/tests/components/thread-playground/message/message-virtualization-policy.test.ts
```

Expected: all modes and restore backends pass without storing message index,
offset, or raw scrollTop.

Run the real CEF transition smoke as well:

```bash
bun run scripts/thread-view-performance-benchmark.mjs \
  --smoke virtualization-toggle --virtualization on \
  --messages 40 --threads 4
```

Expected: the virtual container/rows begin with measured height/transforms;
after selecting Off, all 40 rows mount and the stale direct-DOM styles are
reset to normal-flow values.

## Task 8: Preserve non-modal menus and calibrate Auto thresholds

**Files:**

- Verify unchanged: `packages/ui/src/components/thread-playground/tool/tool-list-view.tsx`
- Verify unchanged: `packages/ui/src/components/thread-playground/examples-menu.tsx`
- Modify: `scripts/thread-view-performance-benchmark.mjs`
- Modify: `docs/performance/thread-view-performance-2026-08.md`
- Modify after measurement:
  `packages/ui/src/components/thread-playground/message/message-virtualization-policy.ts`
- Modify if constants change:
  `packages/ui/tests/components/thread-playground/message/message-virtualization-policy.test.ts`

- [x] **Step 1: Keep the approved dropdown behavior**

Confirm both ordinary menus retain `modal={false}`; do not change Dialogs.

```bash
bun run scripts/thread-view-performance-benchmark.mjs --smoke dropdowns
```

Expected: pointer opening, keyboard navigation, selection, Escape focus return,
outside dismissal, and menu-to-Dialog focus handoff pass.

- [x] **Step 2: Parameterize and run the focused scaling matrix**

Add flags for message count, rendering, virtualization mode, and samples. The
final calibration run used isolated fixtures at 20/25/30/35/40/45/50/60/80/
100 messages for Full, On Demand, and Fast with virtualization Off, plus Full
40 with Auto. Record DOM nodes, editor resources, initial mount,
scroll-frame p50/p95, long tasks, overlay click-to-paint, cached switch, and
evicted remount. The matrix identifies each metric's knee before selecting one
conservative product threshold.

- [x] **Step 3: Calibrate the 32-GiB Full baseline conservatively**

With Virtualization Off, compare every rendering mode against scroll p95,
dropped-frame ratio, long tasks, initial mount, DOM/editor resources, and
overlay response. Select 25 as the 17-32 GiB Full baseline. Apply the agreed
conservative ratios to obtain On Demand 38 (`x1.5`, rounded) and Fast 50 (`x2`).

At most 8 GiB uses 10, 9-16 GiB uses 15, 17-32 GiB uses 25, and above 32 GiB
uses 30. On Demand `x1.5` and Fast `x2` are resource-budget heuristics rather than
claims that every scroll metric scales linearly. Effective Auto always remains
clamped to 10-200.

- [x] **Step 4: Record exact evidence**

Update the report with machine class but no serial or unique identifiers,
dependency state, fixture sizes, raw-result paths under `/tmp`, medians/p95,
chosen tier constants, and comparison with the prior 54-message benchmark.
Separate measured facts from inferred lower-memory tiers.

- [ ] **Step 5: Run complete verification without committing**

```bash
mise run check:changed
mise run test
mise run build:canary
git diff --check
git status --short
```

Expected: zero changed-file diagnostics, zero test failures, successful desktop
build, clean diff validation, and only intentional local changes. Do not commit
or push.

## Task 9: Remove per-frame full-list navigation measurements

**Files:**

- Create: `packages/ui/src/components/thread-playground/message/message-anchor-tracking.ts`
- Create: `packages/ui/tests/components/thread-playground/message/message-anchor-tracking.test.ts`
- Modify: `packages/ui/src/components/thread-playground/message/message-list-view.tsx`
- Modify: `docs/performance/thread-view-performance-2026-08.md`

- [x] **Step 1: Write failing tracker tests**

Test that center-point hit paths resolve the owning message row, exact
measurements preserve the existing nearest-edge and earlier-row tie behavior,
progressive updates run at most every two frames, and an exact reconciliation
runs after two stable frames.

- [x] **Step 2: Verify the new tests fail for the missing module**

```bash
bun test packages/ui/tests/components/thread-playground/message/message-anchor-tracking.test.ts
```

Expected: fail because `message-anchor-tracking.ts` does not exist.

- [x] **Step 3: Implement the mode-independent scheduler and resolvers**

Expose a small scheduler with `notifyViewportChange()` and `dispose()`. Inject
animation-frame functions, a viewport-layout signature reader, a progressive
resolver, an exact resolver, and an index callback so timing stays testable and
the module remains independent of React and TanStack Virtual.

- [x] **Step 4: Wire both message-list backends**

Virtual mode reads the latest virtual items. Non-virtual progressive updates
use `elementsFromPoint()` at the viewport center plus symmetric probes; settled
updates perform one full row measurement. Stop tracking while a cached View is
hidden, reconcile on activation/resize/message or collapsed-state changes, and
keep navigator-click highlighting immediate.

- [x] **Step 5: Verify behavior and performance**

```bash
bun test packages/ui/tests/components/thread-playground/message/message-anchor-tracking.test.ts \
  packages/ui/tests/components/thread-playground/message/virtual-item-center.test.ts \
  packages/ui/tests/components/thread-playground/message/message-list-view-scroll.test.ts
mise run check:changed
git diff --check
```

Run the existing CEF Off-mode scroll benchmark and confirm scroll-frame work no
longer includes an all-row `getBoundingClientRect()` loop while the final anchor
still settles to the correct message.

## Completion checklist

- [ ] One RuntimePaneHost LRU covers Thread and Trace with default View cache 3.
- [ ] Eviction removes only View UI; Session, streaming, Store, and persistence
  remain alive.
- [ ] Full, On Demand, and Fast drafts survive LRU eviction and every close path.
- [ ] Running tabs remain non-closable until stopped.
- [ ] Message rendering, Virtualization, and View cache are independent settings
  under General > Performance.
- [ ] Virtualization supports Off, Auto, Custom default 20, and On.
- [ ] Auto uses physical-memory tier times Full `x1`, On Demand `x1.5`, Fast `x2`,
  clamped to 10-200 and stable outside explicit user configuration changes.
- [ ] Scroll snapshots store only a bottom-anchor message ID and restore with
  end alignment in virtual and non-virtual lists.
- [ ] Tools Add and Examples remain non-modal with accessibility smoke coverage.
- [x] Navigator highlighting uses mounted virtual measurements or non-virtual
  center hit-testing during scroll, then exactly reconciles after scroll stops.
- [ ] Benchmark data selects conservative concrete memory-tier constants and
  documents improvement and remaining tradeoffs.
- [ ] No worktree, commit, push, or PR is created without later authorization.
