import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import type { Thread, ThreadRunSnapshot } from "../../../types";

import { LocalFileSystem } from "./file-system";

const TEMP_DIRS: string[] = [];

interface Workspace {
  fileSystem: LocalFileSystem;
  /** Run history root, deliberately a sibling of the workspace. */
  historyRoot: string;
}

async function _createWorkspace(): Promise<Workspace> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "llm-space-test-"));
  TEMP_DIRS.push(base);
  const root = path.join(base, "workspace");
  await fs.mkdir(root, { recursive: true });
  const historyRoot = path.join(base, "history");
  return {
    fileSystem: new LocalFileSystem(root, { historyRoot }),
    historyRoot,
  };
}

async function _createFileSystem(): Promise<LocalFileSystem> {
  return (await _createWorkspace()).fileSystem;
}

/** The history folder backing a workspace-relative thread path. */
function _historyFolder(historyRoot: string, resourceKey: string): string {
  return path.join(
    historyRoot,
    createHash("sha256").update(resourceKey).digest("hex")
  );
}

/** Every directory below a real path, so a workspace can be asserted flat. */
async function _directoriesUnder(realDir: string): Promise<string[]> {
  const entries = await fs.readdir(realDir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      if (!entry.isDirectory()) return [];
      const children = await _directoriesUnder(path.join(realDir, entry.name));
      return [entry.name, ...children.map((c) => path.join(entry.name, c))];
    })
  );
  return nested.flat();
}

function _legacyRun(id: string): ThreadRunSnapshot & { id: string } {
  return {
    id,
    timestamp: 123,
    usage: {
      input: 10,
      output: 5,
      cacheRead: 2,
      cacheWrite: 1,
      totalTokens: 18,
      cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, total: 3 },
    },
    thread: {
      title: "Historical state",
      context: {
        systemPrompt: "Persist every field",
        messages: [
          {
            id: "user-image",
            role: "user",
            content: [
              {
                type: "image",
                data: "i".repeat(1024),
                mimeType: "image/png",
              },
            ],
          },
          {
            id: "assistant-1",
            role: "assistant",
            content: [{ type: "text", text: "Complete result" }],
          },
        ],
      },
    },
  };
}

afterEach(async () => {
  await Promise.all(
    TEMP_DIRS.splice(0).map((dir) => fs.rm(dir, { recursive: true }))
  );
});

describe("LocalFileSystem.mv", () => {
  test("rejects a rename to an existing path without replacing its contents", async () => {
    const fileSystem = await _createFileSystem();
    await fs.writeFile(fileSystem.realpath("alpha.json"), "alpha");
    await fs.writeFile(fileSystem.realpath("beta.json"), "beta");

    expect(fileSystem.mv("beta.json", "alpha.json")).rejects.toThrow(
      "destination already exists"
    );

    expect(
      fs.readFile(fileSystem.realpath("alpha.json"), "utf8")
    ).resolves.toBe("alpha");
    expect(fs.readFile(fileSystem.realpath("beta.json"), "utf8")).resolves.toBe(
      "beta"
    );
  });
});

describe("LocalFileSystem.write", () => {
  test("writes a new formatted thread file", async () => {
    const fileSystem = await _createFileSystem();
    await fileSystem.write("threads/new.json", { title: "New thread" });

    const raw = await fs.readFile(
      fileSystem.realpath("threads/new.json"),
      "utf8"
    );
    expect(raw).toBe('{\n  "title": "New thread"\n}\n');
    expect(await fileSystem.read("threads/new.json")).toMatchObject({
      title: "New thread",
    });
  });

  test("atomically replaces an existing complete thread", async () => {
    const fileSystem = await _createFileSystem();
    await fileSystem.write("thread.json", { title: "Old thread" });

    await fileSystem.write("thread.json", { title: "New thread" });

    expect(await fileSystem.read("thread.json")).toMatchObject({
      title: "New thread",
    });
  });

  test("leaves the existing destination intact when a temporary write cannot start", async () => {
    const fileSystem = await _createFileSystem();
    const target = fileSystem.realpath("thread.json");
    const original = '{\n  "title": "Old thread"\n}';
    await fs.writeFile(target, original);
    await fs.chmod(path.dirname(target), 0o500);

    try {
      let writeError: unknown;
      try {
        await fileSystem.write("thread.json", { title: "New thread" });
      } catch (error) {
        writeError = error;
      }

      expect(writeError).toBeInstanceOf(Error);
      expect(await fs.readFile(target, "utf8")).toBe(original);
    } finally {
      await fs.chmod(path.dirname(target), 0o700);
    }
  });

  test("cleans its temporary sibling when publication fails", async () => {
    const fileSystem = await _createFileSystem();
    await fs.mkdir(fileSystem.realpath("thread.json"));

    let writeError: unknown;
    try {
      await fileSystem.write("thread.json", { title: "New thread" });
    } catch (error) {
      writeError = error;
    }

    expect(writeError).toBeInstanceOf(Error);
    expect(await fs.readdir(fileSystem.realpath("."))).toEqual(["thread.json"]);
  });

  test("preserves single-file image packing and unpacking", async () => {
    const fileSystem = await _createFileSystem();
    const imageData = "a".repeat(1024);
    const thread: Thread = {
      title: "Images",
      context: {
        messages: [
          {
            id: "user-1",
            role: "user",
            content: [
              {
                type: "image",
                data: imageData,
                mimeType: "image/png",
              },
              {
                type: "image",
                data: imageData,
                mimeType: "image/png",
              },
            ],
          },
        ],
      },
    };

    await fileSystem.write("thread.json", thread);
    const raw = JSON.parse(
      await fs.readFile(fileSystem.realpath("thread.json"), "utf8")
    ) as Record<string, unknown>;
    expect(Object.keys(raw.blobs as Record<string, string>)).toHaveLength(1);
    expect(JSON.stringify(raw).match(/blob:sha256:/g)).toHaveLength(2);
    expect(await fileSystem.read("thread.json")).toEqual(thread);
  });

  test("preserves provider-hosted tool configuration and response metadata", async () => {
    const fileSystem = await _createFileSystem();
    const thread: Thread = {
      title: "Native search",
      context: {
        tools: [
          {
            type: "provider-hosted",
            config: {
              type: "web_search",
              user_location: {
                type: "approximate",
                country: "CN",
              },
            },
          },
        ],
        messages: [
          {
            id: "assistant-1",
            role: "assistant",
            content: [
              {
                type: "text",
                text: "A cited answer",
                annotations: [
                  {
                    type: "url_citation",
                    url: "https://example.com/source",
                    title: "Example source",
                    startIndex: 2,
                    endIndex: 7,
                    raw: {
                      type: "url_citation",
                      url: "https://example.com/source",
                    },
                  },
                ],
              },
            ],
            providerHostedToolActivities: [
              {
                id: "search-1",
                type: "web_search_call",
                status: "completed",
                action: { type: "search", query: "example query" },
                sources: [
                  {
                    url: "https://example.com/source",
                    title: "Example source",
                  },
                ],
                raw: {
                  id: "search-1",
                  type: "web_search_call",
                  status: "completed",
                },
              },
            ],
            responseOutputItems: [
              {
                id: "search-1",
                type: "web_search_call",
                status: "completed",
              },
              {
                id: "message-1",
                type: "message",
                role: "assistant",
                content: [],
              },
            ],
          },
        ],
      },
    };

    await fileSystem.write("thread.json", thread);

    expect(await fileSystem.read("thread.json")).toEqual(thread);
  });
});

describe("LocalFileSystem versioned run history", () => {
  test("preserves released inline run history when externalizing it", async () => {
    const { fileSystem, historyRoot } = await _createWorkspace();
    const firstRun = _legacyRun("legacy-run-1");
    const secondRun = { ..._legacyRun("legacy-run-2"), timestamp: 456 };
    const target = fileSystem.realpath("thread.json");
    await fs.writeFile(
      target,
      JSON.stringify(
        { title: "Current", runHistory: [firstRun, secondRun] },
        null,
        2
      )
    );

    const migrated = await fileSystem.read("thread.json");
    expect(migrated.runHistory).toBeUndefined();
    expect(migrated.runHistoryVersion).toBe(2);
    const references = migrated.runHistoryIndex ?? [];
    const [firstRef, secondRef] = references;
    if (!firstRef || !secondRef) {
      throw new Error("Expected both runs to be externalized");
    }
    expect(references).toHaveLength(2);
    expect([firstRef.id, secondRef.id]).toEqual([
      "legacy-run-1",
      "legacy-run-2",
    ]);
    expect([firstRef.timestamp, secondRef.timestamp]).toEqual([123, 456]);
    expect([firstRef.usage, secondRef.usage]).toEqual([
      firstRun.usage,
      secondRun.usage,
    ]);
    expect(firstRef).toMatchObject({
      preview: {
        summary: "Complete result",
        modelLabel: "No model",
        messageCountLabel: "2 messages",
      },
    });
    expect(
      await fileSystem.readRunSnapshot("thread.json", firstRef.snapshotRef)
    ).toEqual(firstRun.thread);
    expect(
      await fileSystem.readRunSnapshot("thread.json", secondRef.snapshotRef)
    ).toEqual(secondRun.thread);

    const persisted = JSON.parse(await fs.readFile(target, "utf8")) as Thread;
    expect(persisted.runHistory).toBeUndefined();
    expect(persisted.runHistoryIndex).toEqual(migrated.runHistoryIndex);

    const folder = _historyFolder(historyRoot, "thread.json");
    expect(
      JSON.parse(await fs.readFile(path.join(folder, "index.json"), "utf8"))
    ).toEqual({ version: 1, resource: "thread.json" });
    const entry = JSON.parse(
      await fs.readFile(path.join(folder, firstRef.snapshotRef), "utf8")
    ) as { version: number; thread: Thread };
    expect(entry.version).toBe(1);
    expect(entry.thread).toHaveProperty("blobs");
  });

  test("externalizes inline fallback snapshots during an ordinary write", async () => {
    const fileSystem = await _createFileSystem();
    const run = _legacyRun("fallback-run");

    await fileSystem.write("thread.json", {
      title: "Fallback",
      runHistory: [run],
    });

    const saved = await fileSystem.read("thread.json");
    expect(saved.runHistory).toBeUndefined();
    expect(saved.runHistoryIndex?.map((entry) => entry.id)).toEqual([
      "fallback-run",
    ]);
  });

  test("leaves no derived data anywhere in the workspace", async () => {
    const { fileSystem } = await _createWorkspace();
    await fileSystem.mkdir("nested");
    const reference = await fileSystem.archiveRun(
      "nested/thread.json",
      _legacyRun("workspace-run")
    );
    await fileSystem.write("nested/thread.json", {
      title: "Nested",
      runHistoryVersion: 2,
      runHistoryIndex: [reference],
    });

    expect(await _directoriesUnder(fileSystem.realpath(""))).toEqual([
      "nested",
    ]);
    expect((await fileSystem.ls("nested")).map((node) => node.name)).toEqual([
      "thread.json",
    ]);
    expect(
      await fileSystem.readRunSnapshot(
        "nested/thread.json",
        reference.snapshotRef
      )
    ).toEqual(_legacyRun("workspace-run").thread);
  });

  test("follows its thread through copy, move, and a renamed parent", async () => {
    const { fileSystem, historyRoot } = await _createWorkspace();
    const snapshot = _legacyRun("lifecycle-run").thread;
    const reference = await fileSystem.archiveRun(
      "thread.json",
      _legacyRun("lifecycle-run")
    );
    const thread: Thread = {
      title: "Lifecycle",
      runHistoryVersion: 2,
      runHistoryIndex: [reference],
    };
    await fileSystem.write("thread.json", thread);

    await fileSystem.cp("thread.json", "copy.json");
    expect(
      await fileSystem.readRunSnapshot("copy.json", reference.snapshotRef)
    ).toEqual(snapshot);
    expect(
      await fileSystem.readRunSnapshot("thread.json", reference.snapshotRef)
    ).toEqual(snapshot);

    await fileSystem.mv("copy.json", "moved.json");
    expect(
      await fileSystem.readRunSnapshot("moved.json", reference.snapshotRef)
    ).toEqual(snapshot);
    expect(fs.stat(_historyFolder(historyRoot, "copy.json"))).rejects.toThrow();

    await fileSystem.mkdir("nested");
    await fileSystem.mv("moved.json", "nested/moved.json");
    await fileSystem.mv("nested", "renamed");
    expect(
      await fileSystem.readRunSnapshot(
        "renamed/moved.json",
        reference.snapshotRef
      )
    ).toEqual(snapshot);
  });

  test("prunes entries the thread no longer references", async () => {
    const { fileSystem, historyRoot } = await _createWorkspace();
    const reference = await fileSystem.archiveRun(
      "thread.json",
      _legacyRun("pruned-run")
    );
    await fileSystem.write("thread.json", {
      title: "Kept",
      runHistoryVersion: 2,
      runHistoryIndex: [reference],
    });
    expect(
      await fs.stat(_historyFolder(historyRoot, "thread.json"))
    ).toBeDefined();

    await fileSystem.write("thread.json", {
      title: "Pruned",
      runHistoryVersion: 2,
      runHistoryIndex: [],
    });

    expect(
      fs.stat(_historyFolder(historyRoot, "thread.json"))
    ).rejects.toThrow();
  });

  test("keeps run history when its thread is removed", async () => {
    const { fileSystem, historyRoot } = await _createWorkspace();
    const reference = await fileSystem.archiveRun(
      "thread.json",
      _legacyRun("retained-run")
    );
    await fileSystem.write("thread.json", {
      title: "Retained",
      runHistoryVersion: 2,
      runHistoryIndex: [reference],
    });

    await fileSystem.rm("thread.json");

    expect(fs.stat(fileSystem.realpath("thread.json"))).rejects.toThrow();
    expect(
      await fs.stat(_historyFolder(historyRoot, "thread.json"))
    ).toBeDefined();
    expect(
      await fileSystem.readRunSnapshot("thread.json", reference.snapshotRef)
    ).toEqual(_legacyRun("retained-run").thread);
  });

  test("reclaims history only after an orphan outlives the retention window", async () => {
    const { fileSystem, historyRoot } = await _createWorkspace();
    const reference = await fileSystem.archiveRun(
      "thread.json",
      _legacyRun("orphan-run")
    );
    await fileSystem.write("thread.json", {
      title: "Orphan",
      runHistoryVersion: 2,
      runHistoryIndex: [reference],
    });
    const folder = _historyFolder(historyRoot, "thread.json");
    const indexPath = path.join(folder, "index.json");

    // A live thread is never stamped.
    await fileSystem.maintainRunHistory();
    expect(JSON.parse(await fs.readFile(indexPath, "utf8"))).toEqual({
      version: 1,
      resource: "thread.json",
    });

    await fileSystem.rm("thread.json");
    await fileSystem.maintainRunHistory();
    const stamped = JSON.parse(await fs.readFile(indexPath, "utf8")) as {
      orphanedAt?: number;
    };
    expect(typeof stamped.orphanedAt).toBe("number");

    // Still inside the window: the folder survives a second sweep.
    await fileSystem.maintainRunHistory();
    expect(await fs.stat(folder)).toBeDefined();

    // Restoring the thread clears the stamp.
    await fileSystem.write("thread.json", {
      title: "Restored",
      runHistoryVersion: 2,
      runHistoryIndex: [reference],
    });
    await fileSystem.maintainRunHistory();
    expect(JSON.parse(await fs.readFile(indexPath, "utf8"))).toEqual({
      version: 1,
      resource: "thread.json",
    });

    // Backdate the stamp past the retention window.
    await fileSystem.rm("thread.json");
    await fs.writeFile(
      indexPath,
      JSON.stringify({
        version: 1,
        resource: "thread.json",
        orphanedAt: Date.now() - 31 * 24 * 60 * 60 * 1000,
      })
    );
    await fileSystem.maintainRunHistory();

    expect(fs.stat(folder)).rejects.toThrow();
  });

  test("rejects snapshot references that could escape the history folder", async () => {
    const fileSystem = await _createFileSystem();
    expect(
      fileSystem.readRunSnapshot("thread.json", "../outside.json")
    ).rejects.toThrow("Invalid run snapshot reference");
  });
});

describe("LocalFileSystem.read recovery", () => {
  test("backs up and repairs a truncated native thread", async () => {
    const fileSystem = await _createFileSystem();
    const filePath = fileSystem.realpath("recovered.json");
    await fs.writeFile(
      filePath,
      '{"title":"Recovered","context":{"messages":[]}'
    );

    expect(await fileSystem.read("recovered.json")).toMatchObject({
      title: "Recovered",
      context: { messages: [] },
    });
    const repaired = await fs.readFile(filePath, "utf8");
    expect(() => {
      JSON.parse(repaired);
    }).not.toThrow();
    expect(
      (await fs.readdir(fileSystem.realpath(""))).some((name) =>
        name.startsWith("recovered.json.corrupt-")
      )
    ).toBe(true);
  });

  test("does not overwrite a thread whose recovered shape is invalid", async () => {
    const fileSystem = await _createFileSystem();
    const filePath = fileSystem.realpath("invalid.json");
    const original = '{"context":{"messages":[{"role":"user"}]}}';
    await fs.writeFile(filePath, original);

    expect(fileSystem.read("invalid.json")).rejects.toThrow(
      "invalid data shape"
    );
    expect(await fs.readFile(filePath, "utf8")).toBe(original);
  });
});
