import { describe, expect, test } from "bun:test";

import {
  runRemoteRuntimeActionIfAllowed,
  runRemoteTrustContinuationIfAllowed,
} from "./remote-runtime-actions";
import { RuntimeRunTracker } from "./thread-tabs/runtime-run-tracker";

function _deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("remote runtime production actions", () => {
  test("Trust and continue stops before its RPC when reservation is denied", async () => {
    let trustCalls = 0;
    const result = await runRemoteTrustContinuationIfAllowed({
      allowed: () => true,
      acquire: () => null,
      trust: () => {
        trustCalls += 1;
        return Promise.resolve();
      },
    });

    expect(result).toBe(false);
    expect(trustCalls).toBe(0);
  });

  test("runtime teardown keeps its reservation through the committed cleanup", async () => {
    const action = _deferred();
    const cleanupCommit = _deferred();
    const tracker = new RuntimeRunTracker();
    const { runRemoteRuntimeActionIfAllowed } = await import(
      "./remote-runtime-actions"
    );
    const result = runRemoteRuntimeActionIfAllowed({
      allowed: () => true,
      acquire: () => tracker.reserveRuntime("remote:server-1"),
      action: () => action.promise,
      afterAction: () => cleanupCommit.promise,
    });

    action.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(
      tracker.beginRun(
        "remote-pane",
        "remote:server-1",
        "during-cleanup"
      )
    ).toBe(false);

    cleanupCommit.resolve();
    expect(await result).toBe(true);
    expect(
      tracker.beginRun("remote-pane", "remote:server-1", "after-cleanup")
    ).toBe(true);
  });

  test("an applied mutation reports its error after cleanup while the lease is held", async () => {
    const order: string[] = [];
    const tracker = new RuntimeRunTracker();
    const error = new Error("stop failed");
    const result = await runRemoteRuntimeActionIfAllowed({
      allowed: () => true,
      acquire: () => {
        const release = tracker.reserveRuntime("remote:server-1");
        if (!release) return null;
        return () => {
          order.push("release");
          release();
        };
      },
      action: () => {
        order.push("action");
        return Promise.resolve({ applied: true, error });
      },
      afterAction: () => {
        order.push("cleanup");
        expect(
          tracker.beginRun(
            "remote-pane",
            "remote:server-1",
            "during-cleanup"
          )
        ).toBe(false);
      },
      onError: (reported) => {
        order.push("error");
        expect(reported).toBe(error);
      },
    });

    expect(result).toBe(true);
    expect(order).toEqual(["action", "cleanup", "error", "release"]);
  });
});
