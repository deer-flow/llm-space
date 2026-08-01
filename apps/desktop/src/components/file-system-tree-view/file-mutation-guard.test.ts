import { describe, expect, test } from "bun:test";

import type { RuntimeId } from "@/shared/runtime";

import { RuntimeRunTracker } from "../thread-tabs/runtime-run-tracker";

import { runFileMutationWithGuard } from "./file-mutation-guard";
import { runGuardedFileMove } from "./guarded-file-move";

function _deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("file mutation production guard", () => {
  test("delete and overwrite stop before filesystem or optimistic mutations", async () => {
    const attempts: { action: string; paths: string[] }[] = [];
    let mutations = 0;
    const acquireMutation = (paths: string[], _runtimeId: string, action: string) => {
      attempts.push({ action, paths });
      return null;
    };

    const removed = await runFileMutationWithGuard({
      acquireMutation,
      paths: ["folder"],
      runtimeId: "local",
      action: "moving this item to the trash",
      blockedResult: false,
      mutate: () => {
        mutations += 1;
        return Promise.resolve(true);
      },
    });
    const moved = await runFileMutationWithGuard({
      acquireMutation,
      paths: ["source/a.json", "target/a.json"],
      runtimeId: "local",
      action: "replacing this item",
      blockedResult: null,
      mutate: () => {
        mutations += 1;
        return Promise.resolve("target/a.json");
      },
    });

    expect({ moved, mutations, removed }).toEqual({
      moved: null,
      mutations: 0,
      removed: false,
    });
    expect(attempts).toEqual([
      { action: "moving this item to the trash", paths: ["folder"] },
      {
        action: "replacing this item",
        paths: ["source/a.json", "target/a.json"],
      },
    ]);
  });

  test("successful tab reconciliation completes before the guard releases", async () => {
    const order: string[] = [];
    const reconciliationCommit = _deferred();
    let reserved = false;

    const resultPromise = runFileMutationWithGuard({
      acquireMutation: () => {
        order.push("acquire");
        reserved = true;
        return () => {
          reserved = false;
          order.push("release");
        };
      },
      paths: ["source.json", "target.json"],
      runtimeId: "local",
      action: "moving this item",
      blockedResult: null,
      mutate: () => {
        order.push("mutate");
        return Promise.resolve("target.json");
      },
      reconcile: async (to) => {
        order.push(`reconcile:${to}`);
        await reconciliationCommit.promise;
      },
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(reserved).toBe(true);
    expect(order).toEqual([
      "acquire",
      "mutate",
      "reconcile:target.json",
    ]);

    reconciliationCommit.resolve();
    const result = await resultPromise;
    expect(result).toBe("target.json");
    expect(reserved).toBe(false);
    expect(order).toEqual([
      "acquire",
      "mutate",
      "reconcile:target.json",
      "release",
    ]);
  });

  test("move collision inspection happens after acquiring the critical section", async () => {
    const order: string[] = [];

    const result = await runGuardedFileMove({
      acquireMutation: () => {
        order.push("acquire");
        return () => order.push("release");
      },
      paths: ["source.json", "destination/source.json"],
      runtimeId: "local",
      action: "moving this item",
      blockedResult: null,
      detectConflict: () => {
        order.push("inspect");
        return Promise.resolve("source.json");
      },
      confirmConflict: () => {
        order.push("confirm");
        return Promise.resolve(false);
      },
      mutate: () => {
        order.push("move");
        return Promise.resolve("destination/source.json");
      },
    });

    expect(result).toBeNull();
    expect(order).toEqual([
      "acquire",
      "inspect",
      "confirm",
      "release",
    ]);
  });

  test("a held delete keeps its pane readonly and blocks title rename", async () => {
    const deleteRpc = _deferred();
    const tracker = new RuntimeRunTracker();
    const acquireMutation = (paths: string[], runtimeId: RuntimeId) =>
      tracker.reservePaths(runtimeId, paths, ["thread-pane"]);
    const deletion = runFileMutationWithGuard({
      acquireMutation,
      paths: ["folder/thread.json"],
      runtimeId: "local",
      action: "moving this item to the trash",
      blockedResult: false,
      mutate: async () => {
        await deleteRpc.promise;
        return true;
      },
    });
    await Promise.resolve();

    let writes = 0;
    if (
      !tracker.isMutationReserved(
        "thread-pane",
        "local",
        "folder/thread.json"
      )
    ) {
      writes += 1;
    }
    let titleMoves = 0;
    const renamed = await runFileMutationWithGuard({
      acquireMutation,
      paths: ["folder/thread.json", "folder/renamed.json"],
      runtimeId: "local",
      action: "renaming this thread",
      blockedResult: false,
      mutate: () => {
        titleMoves += 1;
        return Promise.resolve(true);
      },
    });

    expect({ renamed, titleMoves, writes }).toEqual({
      renamed: false,
      titleMoves: 0,
      writes: 0,
    });
    deleteRpc.resolve();
    expect(await deletion).toBe(true);
  });
});
