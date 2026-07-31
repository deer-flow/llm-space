import { describe, expect, test } from "bun:test";

import type { RuntimeId } from "@/shared/runtime";

import {
  ShareThreadDialogFlow,
  type ShareThreadTarget,
  type ShareThreadTransaction,
} from "./share-thread-dialog-flow";

function _deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function _target(runtimeId: RuntimeId, path: string): ShareThreadTarget {
  return { runtimeId, path };
}

function _transaction(
  flow: ShareThreadDialogFlow,
  title: string,
  description = ""
): ShareThreadTransaction {
  const transaction = flow.createTransaction({ title, description });
  if (!transaction) throw new Error("Expected an open share transaction");
  return transaction;
}

describe("ShareThreadDialogFlow", () => {
  test("drops A's late share result after close and reopen on B", async () => {
    const flow = new ShareThreadDialogFlow();
    const deferredA = _deferred<{ shareUrl: string }>();
    const displayed: string[] = [];
    flow.sync(true, _target("remote:alpha", "threads/same.json"));
    const transactionA = _transaction(flow, "A title", "A description");

    const pendingA = flow.publish(transactionA, () => deferredA.promise, {
      onStart: () => undefined,
      onSuccess: (result) => displayed.push(result.shareUrl),
      onError: () => undefined,
    });

    flow.sync(false, _target("remote:alpha", "threads/same.json"));
    flow.sync(true, _target("remote:beta", "threads/same.json"));
    deferredA.resolve({ shareUrl: "https://example.test/a" });
    await pendingA;

    expect(displayed).toEqual([]);
  });

  test("drops A's late title read after an open target switches to B", async () => {
    const flow = new ShareThreadDialogFlow();
    const deferredA = _deferred<{ title?: string }>();
    const displayedTitles: string[] = [];
    flow.sync(true, _target("remote:alpha", "threads/a.json"));

    const pendingA = flow.prefillTitle(
      () => deferredA.promise,
      (title) => displayedTitles.push(title)
    );

    flow.sync(true, _target("remote:alpha", "threads/b.json"));
    deferredA.resolve({ title: "A private title" });
    await pendingA;

    expect(displayedTitles).toEqual([]);
  });

  test("does not resume an awaiting-auth A transaction after close and reopen", () => {
    const flow = new ShareThreadDialogFlow();
    const resumed: ShareThreadTransaction[] = [];
    flow.sync(true, _target("remote:alpha", "threads/a.json"));
    const transactionA = _transaction(flow, "A title", "A description");
    expect(flow.beginAuth(transactionA)).toBe(true);
    expect(flow.observeAuth("signingIn")).toEqual({ type: "none" });

    flow.sync(false, _target("remote:alpha", "threads/a.json"));
    flow.sync(true, _target("remote:beta", "threads/b.json"));

    const observation = flow.observeAuth("signedIn");
    if (observation.type === "resume") resumed.push(observation.transaction);
    expect(observation).toEqual({ type: "none" });
    expect(resumed).toEqual([]);
  });

  test("does not mix A metadata with B when target changes during auth", () => {
    const flow = new ShareThreadDialogFlow();
    const resumed: ShareThreadTransaction[] = [];
    flow.sync(true, _target("remote:alpha", "threads/same.json"));
    const transactionA = _transaction(flow, "A title", "A description");
    expect(flow.beginAuth(transactionA)).toBe(true);

    flow.sync(true, _target("remote:beta", "threads/same.json"));

    const observation = flow.observeAuth("signedIn");
    if (observation.type === "resume") resumed.push(observation.transaction);
    expect(observation).toEqual({ type: "none" });
    expect(resumed).toEqual([]);
    expect(transactionA).toMatchObject({
      runtimeId: "remote:alpha",
      path: "threads/same.json",
      title: "A title",
      description: "A description",
    });
  });

  test("publishes and displays a current B transaction normally", async () => {
    const flow = new ShareThreadDialogFlow();
    const requested: ShareThreadTransaction[] = [];
    const states: string[] = [];
    const displayed: string[] = [];
    flow.sync(true, _target("remote:beta", "threads/b.json"));
    const transactionB = _transaction(flow, "  B title  ", "  B description  ");

    await flow.publish(
      transactionB,
      (transaction) => {
        requested.push(transaction);
        return Promise.resolve({ shareUrl: "https://example.test/b" });
      },
      {
        onStart: () => states.push("generating"),
        onSuccess: (result) => displayed.push(result.shareUrl),
        onError: () => states.push("error"),
      }
    );

    expect(requested).toHaveLength(1);
    expect(requested[0]).toMatchObject({
      runtimeId: "remote:beta",
      path: "threads/b.json",
      title: "B title",
      description: "B description",
    });
    expect(states).toEqual(["generating"]);
    expect(displayed).toEqual(["https://example.test/b"]);
  });
});
