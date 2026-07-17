# RPC Stream FIFO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `createRpcTransport()` dequeue streamed events in amortized O(1) time while proving event order and cleanup across every lifecycle path.

**Architecture:** Keep the existing `AgentTransport` API and Electrobun RPC protocol unchanged. Exercise the real async-generator state machine through a controllable RPC boundary fake, then replace front-removal with a head cursor that clears consumed slots and periodically compacts the backing array.

**Tech Stack:** TypeScript, Bun test runner, Electrobun typed RPC, `AgentTransport` async iterables

## Global Constraints

- Work only in `/Users/minimax/workspace/llm-space/.worktrees/issue-75` on branch `issue-75-rpc-fifo`.
- Keep the `AgentTransport` interface and RPC wire payloads unchanged.
- Use `PATH="$HOME/.bun/bin:$PATH"` for Bun-backed commands; do not use npm, pnpm, or yarn.
- Dequeue must be O(1) amortized and consumed entries must not remain retained indefinitely.
- Tests must drive the real transport state machine, not merely assert fake method calls.
- Do not push, open a PR, or modify GitHub issue #75.

---

### Task 1: Add controllable RPC lifecycle coverage

**Files:**
- Create: `apps/desktop/src/client/rpc-transport.test.ts`

**Interfaces:**
- Consumes: `createRpcTransport(): AgentTransport` and `StreamThreadResponsePayload`.
- Produces: a reusable in-test RPC fake that captures started stream IDs, emits keyed responses, counts active listeners, and records Bun abort requests.

- [ ] **Step 1: Build the fake before importing the transport**

Use `mock.module("@/lib/electrobun", ...)` with a fake whose `addMessageListener` and `removeMessageListener` maintain a `Set`, whose `sendStreamThreadRequest` records `{ streamId, request }`, and whose `emit(payload)` synchronously invokes a snapshot of listeners. Dynamically import `createRpcTransport` after registering the mock. Use this minimal request and event vocabulary:

```ts
const REQUEST: AgentStreamRequest = {
  model: { provider: "test", id: "test" },
  context: { messages: [], tools: [] },
};
const START: AgentEvent = { type: "agent_start" };
const TURN: AgentEvent = { type: "turn_start" };
```

- [ ] **Step 2: Test ordered draining before done**

Start one iterator and call `next()` so the RPC request and listener are live. Emit `START`, `TURN`, then `done` before awaiting the pending read. Assert successive `next()` results are `START`, `TURN`, and `{ done: true }`, in that order, and assert the listener count returns to zero.

- [ ] **Step 3: Test remote error cleanup**

Start an iterator, emit `{ type: "error", message: "remote exploded" }`, assert the pending `next()` rejects with that message, then assert zero listeners and no abort request (the remote stream already terminated).

- [ ] **Step 4: Test AbortSignal exactly once**

Start with an `AbortController`, abort it, assert the pending `next()` rejects with a `DOMException` named `AbortError`, exactly one matching `abortStreamThread` was sent, and the listener was removed. Abort the controller again and assert the count remains one.

- [ ] **Step 5: Test early consumer exit**

Start an iterator, emit and consume one event, call `iterator.return()`, then assert the listener was removed and exactly one matching Bun abort was sent.

- [ ] **Step 6: Test concurrent stream isolation**

Start two iterators, capture their distinct stream IDs, emit interleaved events and terminal messages for each, and assert each iterator receives only its own events. Assert both listeners are removed and no abort is sent after normal completion.

- [ ] **Step 7: Add the FIFO regression assertion**

While driving a queued multi-event stream through the real iterator, temporarily replace `Array.prototype.shift` with a wrapper that records invocations from `rpc-transport.ts` and restore it in `finally`. Assert transport draining performs zero front removals. This is the intentional RED assertion against the existing implementation; lifecycle assertions continue to validate behavior rather than fake call wiring.

- [ ] **Step 8: Run the focused test and record RED**

Run:

```bash
PATH="$HOME/.bun/bin:$PATH" bun test apps/desktop/src/client/rpc-transport.test.ts
```

Expected: lifecycle cases pass, while the FIFO regression fails because the current transport calls `events.shift()` for each consumed event.

---

### Task 2: Replace front removal with a releasing cursor queue

**Files:**
- Modify: `apps/desktop/src/client/rpc-transport.ts`
- Test: `apps/desktop/src/client/rpc-transport.test.ts`

**Interfaces:**
- Consumes: the unchanged `createRpcTransport(): AgentTransport` public factory.
- Produces: the same ordered `AsyncIterable<AgentEvent>` and terminal semantics with amortized O(1) dequeue.

- [ ] **Step 1: Implement cursor-based dequeue**

Represent the buffer as `(AgentEvent | undefined)[]` plus `eventHead`. Enqueue with `events.push(message.event)`. Dequeue without shifting:

```ts
const event = events[eventHead];
events[eventHead] = undefined;
eventHead += 1;
yield event!;
```

Clearing the slot releases the consumed event immediately. When the queue becomes empty, reset `events.length = 0` and `eventHead = 0`; this releases the backing references and prevents head growth. If producer and consumer interleave with a non-empty tail, compact only after a threshold and when the consumed prefix is at least half the array, making compaction amortized O(1).

- [ ] **Step 2: Run the focused test and record GREEN**

Run:

```bash
PATH="$HOME/.bun/bin:$PATH" bun test apps/desktop/src/client/rpc-transport.test.ts
```

Expected: all transport lifecycle and FIFO tests pass with zero failures.

- [ ] **Step 3: Refactor only while green**

Extract small module-private helpers/constants only if they clarify the cursor reset/compaction invariant. Do not change RPC payloads, terminal ordering, listener setup, abort behavior, or `AgentTransport` signatures.

- [ ] **Step 4: Re-run the focused test after refactoring**

Run the same focused command. Expected: all tests pass and no warning/error output appears.

---

### Task 3: Verify, self-review, and commit

**Files:**
- Review: `apps/desktop/src/client/rpc-transport.ts`
- Review: `apps/desktop/src/client/rpc-transport.test.ts`
- Review: `docs/superpowers/plans/2026-07-17-issue-75-rpc-fifo.md`

**Interfaces:**
- Consumes: repository Bun, ESLint, and TypeScript tasks.
- Produces: one verified local commit referencing issue #75.

- [ ] **Step 1: Run the full test suite**

```bash
PATH="$HOME/.bun/bin:$PATH" bun test
```

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run lint and typecheck**

```bash
PATH="$HOME/.bun/bin:$PATH" mise run lint
PATH="$HOME/.bun/bin:$PATH" mise run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 3: Review the diff against every acceptance criterion**

Confirm ordering, queued-before-done draining, remote rejection, one-shot signal abort, early-exit listener removal plus Bun abort, stream-ID isolation, terminal cleanup, amortized O(1) dequeue, and cleared consumed slots. Confirm `git diff --check` reports no whitespace errors and no unrelated files changed.

- [ ] **Step 4: Commit the verified change**

```bash
git add apps/desktop/src/client/rpc-transport.ts apps/desktop/src/client/rpc-transport.test.ts docs/superpowers/plans/2026-07-17-issue-75-rpc-fifo.md
git commit -m "perf: make RPC stream queue amortized O(1) (#75)"
```

Expected: one commit is created on `issue-75-rpc-fifo`; nothing is pushed.
