import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import * as z from "zod";

import { RunHistoryStore } from "../../../../src/server/storage/local/run-history-store";

const TEMP_DIRS: string[] = [];
const EntrySchema = z.object({ value: z.string() });
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

async function _createStore(): Promise<{
  store: RunHistoryStore;
  root: string;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "llm-space-history-"));
  TEMP_DIRS.push(root);
  return { store: new RunHistoryStore(root), root };
}

function _folder(root: string, resourceKey: string): string {
  return path.join(
    root,
    createHash("sha256").update(resourceKey).digest("hex")
  );
}

function _ref(seed: string): string {
  return `${createHash("sha256").update(seed).digest("hex")}.json`;
}

async function _readIndex(
  root: string,
  resourceKey: string
): Promise<Record<string, unknown>> {
  return JSON.parse(
    await fs.readFile(
      path.join(_folder(root, resourceKey), "index.json"),
      "utf8"
    )
  ) as Record<string, unknown>;
}

const ALWAYS_LIVE = () => Promise.resolve(true);
const NEVER_LIVE = () => Promise.resolve(false);

afterEach(async () => {
  await Promise.all(
    TEMP_DIRS.splice(0).map((dir) => fs.rm(dir, { recursive: true }))
  );
});

describe("RunHistoryStore entries", () => {
  test("round-trips an entry and marks the folder with its resource", async () => {
    const { store, root } = await _createStore();
    const ref = _ref("entry-1");

    await store.writeEntry("threads/a.json", ref, { value: "kept" });

    expect(await store.readEntry("threads/a.json", ref, EntrySchema)).toEqual({
      value: "kept",
    });
    expect(await _readIndex(root, "threads/a.json")).toEqual({
      version: 1,
      resource: "threads/a.json",
    });
  });

  test("rejects an entry reference that could escape its folder", async () => {
    const { store } = await _createStore();

    expect(
      store.readEntry("a.json", "../outside.json", EntrySchema)
    ).rejects.toThrow("Invalid run snapshot reference");
    expect(
      store.writeEntry("a.json", "../outside.json", { value: "no" })
    ).rejects.toThrow("Invalid run snapshot reference");
  });

  test("keeps entries of different resources apart", async () => {
    const { store } = await _createStore();
    const ref = _ref("shared");

    await store.writeEntry("a.json", ref, { value: "a" });
    await store.writeEntry("b.json", ref, { value: "b" });

    expect(await store.readEntry("a.json", ref, EntrySchema)).toEqual({
      value: "a",
    });
    expect(await store.readEntry("b.json", ref, EntrySchema)).toEqual({
      value: "b",
    });
  });
});

describe("RunHistoryStore.prune", () => {
  test("drops unreferenced entries and keeps the rest", async () => {
    const { store, root } = await _createStore();
    const kept = _ref("kept");
    const dropped = _ref("dropped");
    await store.writeEntry("a.json", kept, { value: "kept" });
    await store.writeEntry("a.json", dropped, { value: "dropped" });

    await store.prune("a.json", [kept]);

    const remaining = await fs.readdir(_folder(root, "a.json"));
    expect(remaining.sort()).toEqual([kept, "index.json"].sort());
  });

  test("removes the folder once nothing is referenced", async () => {
    const { store, root } = await _createStore();
    await store.writeEntry("a.json", _ref("only"), { value: "only" });

    await store.prune("a.json", []);

    expect(fs.stat(_folder(root, "a.json"))).rejects.toThrow();
  });

  test("ignores a resource that has no history", async () => {
    const { store } = await _createStore();
    expect(store.prune("missing.json", [])).resolves.toBeUndefined();
  });
});

describe("RunHistoryStore re-keying", () => {
  test("moves a folder and rewrites its resource", async () => {
    const { store, root } = await _createStore();
    const ref = _ref("moved");
    await store.writeEntry("a.json", ref, { value: "moved" });

    await store.move("a.json", "nested/b.json");

    expect(fs.stat(_folder(root, "a.json"))).rejects.toThrow();
    expect(await store.readEntry("nested/b.json", ref, EntrySchema)).toEqual({
      value: "moved",
    });
    expect(await _readIndex(root, "nested/b.json")).toEqual({
      version: 1,
      resource: "nested/b.json",
    });
  });

  test("copies a folder while leaving the source in place", async () => {
    const { store, root } = await _createStore();
    const ref = _ref("copied");
    await store.writeEntry("a.json", ref, { value: "copied" });

    await store.copy("a.json", "b.json");

    expect(await store.readEntry("a.json", ref, EntrySchema)).toEqual({
      value: "copied",
    });
    expect(await store.readEntry("b.json", ref, EntrySchema)).toEqual({
      value: "copied",
    });
    expect(await _readIndex(root, "a.json")).toEqual({
      version: 1,
      resource: "a.json",
    });
  });

  test("replaces history already sitting at the destination", async () => {
    const { store } = await _createStore();
    const source = _ref("source");
    const stale = _ref("stale");
    await store.writeEntry("a.json", source, { value: "source" });
    await store.writeEntry("b.json", stale, { value: "stale" });

    await store.move("a.json", "b.json");

    expect(await store.readEntry("b.json", source, EntrySchema)).toEqual({
      value: "source",
    });
    expect(store.readEntry("b.json", stale, EntrySchema)).rejects.toThrow();
  });

  test("ignores a source without history", async () => {
    const { store, root } = await _createStore();

    await store.move("missing.json", "b.json");

    expect(fs.stat(_folder(root, "b.json"))).rejects.toThrow();
  });
});

describe("RunHistoryStore.maintain", () => {
  test("leaves a live resource untouched", async () => {
    const { store, root } = await _createStore();
    await store.writeEntry("a.json", _ref("live"), { value: "live" });

    await store.maintain(ALWAYS_LIVE);

    expect(await _readIndex(root, "a.json")).toEqual({
      version: 1,
      resource: "a.json",
    });
  });

  test("stamps an orphan before reclaiming it", async () => {
    const { store, root } = await _createStore();
    await store.writeEntry("a.json", _ref("orphan"), { value: "orphan" });

    await store.maintain(NEVER_LIVE);

    const index = await _readIndex(root, "a.json");
    expect(index.resource).toBe("a.json");
    expect(typeof index.orphanedAt).toBe("number");
    await store.maintain(NEVER_LIVE);
    expect(await fs.stat(_folder(root, "a.json"))).toBeDefined();
  });

  test("clears the stamp when the resource comes back", async () => {
    const { store, root } = await _createStore();
    await store.writeEntry("a.json", _ref("restored"), { value: "restored" });
    await store.maintain(NEVER_LIVE);

    await store.maintain(ALWAYS_LIVE);

    expect(await _readIndex(root, "a.json")).toEqual({
      version: 1,
      resource: "a.json",
    });
  });

  test("removes an orphan past the retention window", async () => {
    const { store, root } = await _createStore();
    await store.writeEntry("a.json", _ref("expired"), { value: "expired" });
    await fs.writeFile(
      path.join(_folder(root, "a.json"), "index.json"),
      JSON.stringify({
        version: 1,
        resource: "a.json",
        orphanedAt: Date.now() - RETENTION_MS - 1000,
      })
    );

    await store.maintain(NEVER_LIVE);

    expect(fs.stat(_folder(root, "a.json"))).rejects.toThrow();
  });

  test("removes a folder whose marker is unusable", async () => {
    const { store, root } = await _createStore();
    await store.writeEntry("a.json", _ref("corrupt"), { value: "corrupt" });
    await fs.writeFile(
      path.join(_folder(root, "a.json"), "index.json"),
      "{ not json"
    );

    await store.maintain(ALWAYS_LIVE);

    expect(fs.stat(_folder(root, "a.json"))).rejects.toThrow();
  });

  test("removes a folder that lost its marker", async () => {
    const { store, root } = await _createStore();
    await store.writeEntry("a.json", _ref("unmarked"), { value: "unmarked" });
    await fs.rm(path.join(_folder(root, "a.json"), "index.json"));

    await store.maintain(ALWAYS_LIVE);

    expect(fs.stat(_folder(root, "a.json"))).rejects.toThrow();
  });

  test("ignores a store that was never written to", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "llm-space-history-"));
    TEMP_DIRS.push(root);
    const store = new RunHistoryStore(path.join(root, "missing"));

    expect(store.maintain(ALWAYS_LIVE)).resolves.toBeUndefined();
  });
});
