import { describe, expect, test } from "bun:test";

import type { Thread, ThreadRunReference } from "@llm-space/core";

import { createThreadStore } from "../../../../src/components/thread-playground/stores/thread-store";

const EMPTY_THREAD: Thread = { context: { messages: [] } };

function _reference(id: string): ThreadRunReference {
  return {
    id,
    timestamp: id.charCodeAt(0),
    snapshotRef: `${id.charCodeAt(0).toString(16).padStart(2, "0").repeat(32)}.json`,
    preview: {
      summary: id,
      modelLabel: "No model",
      messageCountLabel: "0 messages",
    },
  };
}

describe("thread runtime ownership", () => {
  test.each(["local", "remote:auxiliary-generation"])(
    "captures the owning %s runtime in store state",
    (runtimeId) => {
      const store = createThreadStore(EMPTY_THREAD, { runtimeId });

      expect(store.getState().runtimeId).toBe(runtimeId);
    }
  );

  test("does not follow a changed options object after creation", () => {
    const options: { runtimeId?: string } = {
      runtimeId: "remote:auxiliary-generation",
    };
    const store = createThreadStore(EMPTY_THREAD, options);

    options.runtimeId = "local";

    expect(store.getState().runtimeId).toBe("remote:auxiliary-generation");
  });
});

describe("thread run snapshot loading", () => {
  test("normalizes versioned references without loading them eagerly", () => {
    let reads = 0;
    const reference = _reference("a");
    const store = createThreadStore(
      {
        runHistoryVersion: 2,
        runHistoryIndex: [reference],
      },
      {
        readRunSnapshot: () => {
          reads += 1;
          return Promise.resolve({ title: "Loaded" });
        },
      }
    );

    expect(store.getState().runHistory).toEqual([reference]);
    expect(store.getState().thread.runHistory).toBeUndefined();
    expect(reads).toBe(0);
  });

  test("loads references on demand and maintains a two-entry LRU", async () => {
    const reads: string[] = [];
    const references = ["a", "b", "c"].map(_reference);
    const store = createThreadStore(
      { runHistoryVersion: 2, runHistoryIndex: references },
      {
        readRunSnapshot: (snapshotRef) => {
          const reference = references.find(
            (candidate) => candidate.snapshotRef === snapshotRef
          );
          if (!reference) return Promise.reject(new Error("Unknown reference"));
          reads.push(reference.id);
          return Promise.resolve({ title: `Loaded ${reference.id}` });
        },
      }
    );

    const [a, b, c] = store.getState().runHistory;
    if (!a || !b || !c) throw new Error("Expected three run references");
    expect((await store.getState().loadRunSnapshot(a)).thread.title).toBe(
      "Loaded a"
    );
    await store.getState().loadRunSnapshot(b);
    await store.getState().loadRunSnapshot(a);
    await store.getState().loadRunSnapshot(c);
    await store.getState().loadRunSnapshot(b);

    expect(reads).toEqual(["a", "b", "c", "b"]);
  });

  test("returns inline legacy snapshots without invoking sidecar storage", async () => {
    let reads = 0;
    const store = createThreadStore(
      {
        runHistory: [{ id: "inline", timestamp: 1, thread: { title: "Inline" } }],
      },
      {
        readRunSnapshot: () => {
          reads += 1;
          return Promise.resolve({});
        },
      }
    );
    const run = store.getState().runHistory[0];
    if (!run) throw new Error("Expected inline run");

    expect((await store.getState().loadRunSnapshot(run)).thread.title).toBe(
      "Inline"
    );
    expect(reads).toBe(0);
  });

  test("reports unavailable sidecar storage instead of returning partial data", async () => {
    const store = createThreadStore({
      runHistoryVersion: 2,
      runHistoryIndex: [_reference("a")],
    });
    const run = store.getState().runHistory[0];
    if (!run) throw new Error("Expected referenced run");

    expect(store.getState().loadRunSnapshot(run)).rejects.toThrow(
      "Run snapshot storage is unavailable"
    );
  });
});
