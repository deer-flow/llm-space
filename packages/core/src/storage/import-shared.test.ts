import { describe, expect, test } from "bun:test";

import type { SharedThread, SharedThreadSource } from "../types/storage/connector";
import type { FileNode, FileSystem } from "../types/storage/file-system";
import type { ThreadStorage } from "../types/storage/thread-storage";
import type { Thread } from "../types/threads/thread";

import { importSharedThread } from "./import-shared";

function _source(thread: Thread, meta: SharedThread["meta"]): SharedThreadSource {
  return { readShared: () => Promise.resolve({ thread, meta }) };
}

/** Minimal in-memory FileSystem + ThreadStorage: records writes, lists a dir. */
function _dest(): FileSystem &
  ThreadStorage & { readonly files: Map<string, Thread> } {
  const files = new Map<string, Thread>();
  return {
    files,
    ls: (dir) => {
      const prefix = dir === "" ? "" : `${dir}/`;
      const nodes: FileNode[] = [];
      for (const path of files.keys()) {
        if (!path.startsWith(prefix)) continue;
        const rest = path.slice(prefix.length);
        if (rest.includes("/")) continue;
        nodes.push({ name: rest, path, type: "file" });
      }
      return Promise.resolve(nodes);
    },
    write: (path, thread) => {
      files.set(path, thread);
      return Promise.resolve();
    },
    read: (path) => Promise.resolve(files.get(path)!),
    mkdir: () => Promise.resolve(),
    cp: () => Promise.resolve(),
    mv: () => Promise.resolve(),
    rm: () => Promise.resolve(),
  };
}

const META: SharedThread["meta"] = {
  connectorId: "gist",
  threadId: "abc",
  filename: "general-agent.json",
  title: "General Agent",
};

describe("importSharedThread", () => {
  test("writes under shared/ named after the title and sets originalURL", async () => {
    const dest = _dest();
    const result = await importSharedThread(
      _source({ title: "General Agent" }, META),
      "abc",
      dest,
      { originalUrl: "llm-space://shared/gist/threads/abc" }
    );

    expect(result.path).toBe("shared/General Agent.json");
    expect(dest.files.get("shared/General Agent.json")?.originalURL).toBe(
      "llm-space://shared/gist/threads/abc"
    );
  });

  test("dedupes with -1, -2 on collision", async () => {
    const dest = _dest();
    const src = _source({ title: "General Agent" }, META);

    expect((await importSharedThread(src, "abc", dest)).path).toBe(
      "shared/General Agent.json"
    );
    expect((await importSharedThread(src, "abc", dest)).path).toBe(
      "shared/General Agent-1.json"
    );
    expect((await importSharedThread(src, "abc", dest)).path).toBe(
      "shared/General Agent-2.json"
    );
  });

  test("falls back to the filename stem, then a default, for an untitled thread", async () => {
    const dest = _dest();
    await importSharedThread(
      _source({}, { connectorId: "gist", threadId: "x", filename: "notes.json" }),
      "x",
      dest
    );
    expect([...dest.files.keys()]).toEqual(["shared/notes.json"]);

    await importSharedThread(
      _source({}, { connectorId: "gist", threadId: "y" }),
      "y",
      dest
    );
    expect(dest.files.has("shared/shared-thread.json")).toBe(true);
  });
});
