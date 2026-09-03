import { afterEach, expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { LocalFileSystem } from "../../../../src/server/storage/local/file-system";
import { getMessageText } from "../../../../src/types";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "spawn-agent-test-"));
  roots.push(root);
  const workspace = path.join(root, "workspace");
  await mkdir(workspace);
  const storage = new LocalFileSystem(workspace, {
    historyRoot: path.join(root, "history"),
  });
  await storage.mkdir("project");
  await storage.write("project/parent.json", {
    context: { systemPrompt: "Disk version" },
  });
  return { root, workspace, storage };
}
const input = {
  parentPath: "project/parent.json",
  thread: {
    runtimeId: "remote:test",
    context: { systemPrompt: "Latest editor version" },
  },
  arguments: {
    description: "Review code",
    task_name: "review",
    prompt: "Review it",
  },
};

test("concurrent same-name children never overwrite and contain valid complete threads", async () => {
  const { workspace, storage } = await fixture();
  const results = await Promise.all(
    Array.from({ length: 8 }, () => storage.createSubagentThread(input))
  );
  expect(new Set(results.map((result) => result.path)).size).toBe(8);
  expect(results.map((result) => result.path)).toContain(
    "project/tasks/parent-review.json"
  );
  for (const result of results) {
    const saved = await storage.read(result.path);
    expect(saved.title).toBe(path.basename(result.path, ".json"));
    expect(saved.context?.systemPrompt).toBe("Latest editor version");
    expect(saved.runtimeId).toBe("remote:test");
    expect(saved.context?.messages).toHaveLength(1);
    expect(
      JSON.parse(await readFile(path.join(workspace, result.path), "utf8"))
    ).toMatchObject({ title: saved.title });
  }
  expect((await readdir(path.join(workspace, "project/tasks"))).length).toBe(8);
  expect((await storage.read(input.parentPath)).context?.systemPrompt).toBe(
    "Disk version"
  );
});

test("rejects missing parents, traversal and tasks symlinks outside workspace", async () => {
  const { root, workspace, storage } = await fixture();
  await rejects(
    storage.createSubagentThread({ ...input, parentPath: "missing.json" })
  );
  await rejects(
    storage.createSubagentThread({ ...input, parentPath: "../parent.json" })
  );
  await rejects(
    storage.createSubagentThread({
      ...input,
      arguments: { ...input.arguments, task_name: "../escape" },
    })
  );
  const outside = path.join(root, "outside");
  await mkdir(outside);
  await symlink(outside, path.join(workspace, "project/tasks"));
  await rejects(storage.createSubagentThread(input), /outside the workspace/);
  expect(await readdir(outside)).toEqual([]);
});

test("preserves readable task names and resolves normalized filename collisions", async () => {
  const { storage } = await fixture();
  const names = [
    "US 2026 GDP Research",
    "us-2026-gdp-research",
    "US  2026  GDP Research",
  ];
  const results = await Promise.all(
    names.map((task_name) =>
      storage.createSubagentThread({
        ...input,
        arguments: { ...input.arguments, task_name },
      })
    )
  );
  expect(new Set(results.map(({ path }) => path))).toEqual(
    new Set([
      "project/tasks/parent-us-2026-gdp-research.json",
      "project/tasks/parent-us-2026-gdp-research-1.json",
      "project/tasks/parent-us-2026-gdp-research-2.json",
    ])
  );
  for (const [index, result] of results.entries()) {
    const child = await storage.read(result.path);
    expect(getMessageText(child.context!.messages![0])).toContain(
      `Task: ${names[index]}\n`
    );
  }
});
