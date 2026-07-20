# Atomic Thread Write Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `LocalFileSystem.write()` publish complete thread JSON atomically while preserving the existing formatted single-file image blob representation.

**Architecture:** Normalize, pack, and stringify the thread entirely in memory before interacting with the destination. Write the serialized bytes through an exclusively-created, UUID-named sibling file handle, sync and close that handle, then use the platform filesystem rename operation to atomically publish the new file; on every failure, best-effort close and remove the temporary sibling while rethrowing the original error.

**Tech Stack:** TypeScript, Bun 1.3 test runner, Node-compatible `node:fs/promises`, `node:crypto`, POSIX/macOS atomic rename semantics.

## Global Constraints

- Work only in `/Users/minimax/workspace/llm-space/.worktrees/issue-74` on branch `issue-74-atomic-thread-write`.
- Use Bun and mise entry points; do not use npm, pnpm, or yarn.
- Preserve two-space formatted JSON and the current single-file `blobs` table.
- Do not add a production test-only method or a broad filesystem abstraction.
- Temporary files must be unique siblings of the destination and must be cleaned up best-effort without masking the original failure.
- Verify focused LocalFileSystem tests, the full Bun suite, lint, and typecheck.

---

### Task 1: Specify atomic publication through observable filesystem behavior

**Files:**

- Modify: `packages/core/src/server/storage/local/file-system.test.ts`

**Interfaces:**

- Consumes: `new LocalFileSystem(root)`, `LocalFileSystem.write(path, thread)`, `LocalFileSystem.read(path)`, and `LocalFileSystem.realpath(path)`.
- Produces: Regression coverage for new files, replacement files, temporary-write failure, cleanup after publication failure, and image packing/unpacking.

- [x] **Step 1: Add real-filesystem success and failure tests**

Add a `LocalFileSystem.write` describe block with small thread fixtures. Assert that a new file is formatted and readable, replacing an existing file publishes only the new complete thread, a read-only parent directory causes the temporary sibling creation to reject while preserving the old destination bytes, and a destination-directory rename failure leaves no UUID temporary sibling behind. Restore directory permissions in `finally` before test cleanup.

```ts
describe("LocalFileSystem.write", () => {
  test("writes a new formatted thread file", async () => {
    const fileSystem = await _createFileSystem();
    await fileSystem.write("threads/new.json", { title: "New thread" });

    const raw = await fs.readFile(
      fileSystem.realpath("threads/new.json"),
      "utf8"
    );
    expect(raw).toBe('{\n  "title": "New thread"\n}');
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
});
```

- [x] **Step 2: Add image packing regression coverage**

Write a thread containing the same image payload at least 1,024 characters long twice. Assert the raw file retains one `blobs` entry and two `blob:sha256:` references, then assert `read()` restores the original inline image data.

```ts
test("preserves single-file image packing and unpacking", async () => {
  const fileSystem = await _createFileSystem();
  const imageData = "a".repeat(1024);
  const thread = {
    title: "Images",
    context: {
      messages: [
        {
          id: "user-1",
          role: "user" as const,
          content: [
            {
              type: "image_data" as const,
              data: imageData,
              mimeType: "image/png",
            },
            {
              type: "image_data" as const,
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
```

- [x] **Step 3: Run the focused tests and record RED**

Run: `PATH="$HOME/.bun/bin:$PATH" bun test packages/core/src/server/storage/local/file-system.test.ts`

Expected: the new-file, replacement, and image compatibility cases pass against current behavior, while `leaves the existing destination intact when a temporary write cannot start` fails because the old implementation writes directly to the already-openable destination instead of creating a sibling.

---

### Task 2: Publish serialized threads with atomic sibling replacement

**Files:**

- Modify: `packages/core/src/server/storage/local/file-system.ts`
- Test: `packages/core/src/server/storage/local/file-system.test.ts`

**Interfaces:**

- Consumes: `fs.open(path, "wx")`, `FileHandle.writeFile()`, `FileHandle.sync()`, `FileHandle.close()`, `fs.rename()`, and `fs.rm(path, { force: true })`.
- Produces: unchanged public `LocalFileSystem.write(p: string, thread: Thread): Promise<void>` semantics with atomic publication.

- [x] **Step 1: Serialize before touching the destination**

Normalize and pack the thread, then compute `const text = JSON.stringify(serializable, null, 2)` before creating directories or opening any file. This ensures normalization, packing, or serialization failures cannot alter the destination.

```ts
const serializable = packThreadImages(normalizeThread(thread));
const text = JSON.stringify(serializable, null, 2);
await fs.mkdir(path.dirname(real), { recursive: true });
```

- [x] **Step 2: Implement the unique sibling write and atomic rename**

Import `randomUUID` from `node:crypto`. Create a hidden sibling such as `.${path.basename(real)}.${randomUUID()}.tmp` using exclusive `"wx"`, write UTF-8 text, sync, close, and rename it to the destination. Keep the handle variable until close succeeds so failure recovery can retry close, and track successful creation so an exclusive-open collision never causes cleanup to remove a sibling owned by another writer.

```ts
const temporary = path.join(
  path.dirname(real),
  `.${path.basename(real)}.${randomUUID()}.tmp`
);
let handle: fs.FileHandle | undefined;
let temporaryCreated = false;

try {
  handle = await fs.open(temporary, "wx");
  temporaryCreated = true;
  await handle.writeFile(text, "utf8");
  await handle.sync();
  await handle.close();
  handle = undefined;
  await fs.rename(temporary, real);
} catch (error) {
  if (handle) {
    try {
      await handle.close();
    } catch {
      // Preserve the original write/sync/close failure.
    }
  }
  if (temporaryCreated) {
    try {
      await fs.rm(temporary, { force: true });
    } catch {
      // Preserve the original operation failure.
    }
  }
  throw error;
}
```

- [x] **Step 3: Run focused tests and record GREEN**

Run: `PATH="$HOME/.bun/bin:$PATH" bun test packages/core/src/server/storage/local/file-system.test.ts`

Expected: all LocalFileSystem tests pass, including the failure tests, and the temporary sibling directory listing contains only the original destination entry.

- [x] **Step 4: Run formatting and inspect the diff**

Run: `PATH="$HOME/.bun/bin:$PATH" bunx prettier --write packages/core/src/server/storage/local/file-system.ts packages/core/src/server/storage/local/file-system.test.ts docs/superpowers/plans/2026-07-17-issue-74-atomic-thread-write.md`

Run: `git diff --check && git diff -- packages/core/src/server/storage/local/file-system.ts packages/core/src/server/storage/local/file-system.test.ts`

Expected: no whitespace errors; the production diff changes only the write path and required import.

---

### Task 3: Verify and commit issue #74

**Files:**

- Verify: all changed files

**Interfaces:**

- Consumes: repository Bun tests, ESLint, and TypeScript configurations.
- Produces: one reviewed commit on `issue-74-atomic-thread-write` referencing issue `#74`.

- [x] **Step 1: Run focused and full verification**

Run: `PATH="$HOME/.bun/bin:$PATH" bun test packages/core/src/server/storage/local/file-system.test.ts`

Run: `PATH="$HOME/.bun/bin:$PATH" bun test`

Run: `PATH="$HOME/.bun/bin:$PATH" mise run lint`

Run: `PATH="$HOME/.bun/bin:$PATH" mise run typecheck`

Expected: zero test failures, zero lint errors, and zero type errors.

- [x] **Step 2: Self-review against the authoritative issue**

Run: `gh issue view 74 --repo deer-flow/llm-space && git diff --check && git status --short && git diff --stat`

Confirm each acceptance criterion maps to a focused test and that cleanup errors cannot replace the original thrown error. Confirm no production test-only method, unrelated edits, or generated runtime data were added.

- [ ] **Step 3: Commit the verified implementation**

```bash
git add docs/superpowers/plans/2026-07-17-issue-74-atomic-thread-write.md \
  packages/core/src/server/storage/local/file-system.ts \
  packages/core/src/server/storage/local/file-system.test.ts
git commit -m "fix(storage): write thread files atomically (#74)"
```

- [ ] **Step 4: Verify the commit and clean worktree**

Run: `git status --short --branch && git show --stat --oneline --decorate HEAD`

Expected: branch `issue-74-atomic-thread-write` is clean and `HEAD` is the issue #74 commit containing only the plan, storage implementation, and storage tests.
