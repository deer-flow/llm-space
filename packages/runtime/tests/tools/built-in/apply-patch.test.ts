import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { applyPatch } from "../../../src/tools/built-in/apply-patch";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

async function createWorkspace(): Promise<string> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "apply-patch-tool-")
  );
  temporaryDirectories.push(directory);
  return directory;
}

describe("apply_patch built-in", () => {
  test("adds, updates, and deletes files relative to the workspace", async () => {
    const workspace = await createWorkspace();
    await fs.writeFile(path.join(workspace, "update.txt"), "one\ntwo\nthree\n");
    await fs.writeFile(path.join(workspace, "delete.txt"), "obsolete\n");

    const result = await applyPatch(
      `*** Begin Patch
*** Update File: update.txt
@@
 one
-two
+second
 three
*** Add File: nested/added.txt
+hello
+world
*** Delete File: delete.txt
*** End Patch`,
      workspace
    );

    expect(await fs.readFile(path.join(workspace, "update.txt"), "utf8")).toBe(
      "one\nsecond\nthree\n"
    );
    expect(
      await fs.readFile(path.join(workspace, "nested/added.txt"), "utf8")
    ).toBe("hello\nworld\n");
    expect(await fs.exists(path.join(workspace, "delete.txt"))).toBe(false);
    expect(result).toContain("M update.txt");
  });

  test("supports moving an updated file", async () => {
    const workspace = await createWorkspace();
    await fs.writeFile(path.join(workspace, "before.txt"), "before");

    await applyPatch(
      `*** Begin Patch
*** Update File: before.txt
*** Move to: nested/after.txt
@@
-before
+after
*** End Patch`,
      workspace
    );

    expect(await fs.exists(path.join(workspace, "before.txt"))).toBe(false);
    expect(
      await fs.readFile(path.join(workspace, "nested/after.txt"), "utf8")
    ).toBe("after\n");
  });

  test("validates every operation before writing any files", async () => {
    const workspace = await createWorkspace();
    const existingPath = path.join(workspace, "existing.txt");
    await fs.writeFile(existingPath, "original\n");

    expect(
      applyPatch(
        `*** Begin Patch
*** Update File: existing.txt
@@
-original
+changed
*** Update File: missing.txt
@@
-missing
+changed
*** End Patch`,
        workspace
      )
    ).rejects.toThrow();

    expect(await fs.readFile(existingPath, "utf8")).toBe("original\n");
  });

  test("rejects malformed patches and unmatched context", async () => {
    const workspace = await createWorkspace();
    const filePath = path.join(workspace, "example.txt");
    await fs.writeFile(filePath, "actual\n");

    expect(applyPatch("not a patch", workspace)).rejects.toThrow(
      "Patch must start"
    );
    expect(
      applyPatch(
        `*** Begin Patch
*** Update File: example.txt
@@
-expected
+replacement
*** End Patch`,
        workspace
      )
    ).rejects.toThrow("Failed to find expected lines");
    expect(await fs.readFile(filePath, "utf8")).toBe("actual\n");
  });

  test("matches Codex context headers and whitespace tolerance", async () => {
    const workspace = await createWorkspace();
    const filePath = path.join(workspace, "example.txt");
    await fs.writeFile(
      filePath,
      "function first() {\n  return 1;\n}\n\nfunction target() {\n  return 2;  \n}",
      "utf8"
    );

    await applyPatch(
      `*** Begin Patch
*** Update File: example.txt
@@ function target() {
-return 2;
+return 3;
*** End Patch`,
      workspace
    );

    expect(await fs.readFile(filePath, "utf8")).toBe(
      "function first() {\n  return 1;\n}\n\nfunction target() {\nreturn 3;\n}\n"
    );
  });

  test("treats bare blank lines in update hunks as empty context", async () => {
    const workspace = await createWorkspace();
    await fs.writeFile(
      path.join(workspace, "main.py"),
      "import os\n\ndef main():\n    return 1\n"
    );
    await fs.writeFile(path.join(workspace, "other.txt"), "beta\n");

    // Models and editors often drop the leading space from blank context lines
    // and separate file sections with an empty line. Codex accepts both.
    await applyPatch(
      [
        "*** Begin Patch",
        "*** Update File: main.py",
        "@@",
        " import os",
        "",
        " def main():",
        "-    return 1",
        "+    return 2",
        "",
        "*** Update File: other.txt",
        "@@",
        "-beta",
        "+BETA",
        "*** End Patch",
      ].join("\n"),
      workspace
    );

    expect(await fs.readFile(path.join(workspace, "main.py"), "utf8")).toBe(
      "import os\n\ndef main():\n    return 2\n"
    );
    expect(await fs.readFile(path.join(workspace, "other.txt"), "utf8")).toBe(
      "BETA\n"
    );
  });

  test("still rejects non-blank hunk lines without a diff marker", async () => {
    const workspace = await createWorkspace();
    const filePath = path.join(workspace, "example.txt");
    await fs.writeFile(filePath, "one\ntwo\n");

    expect(
      applyPatch(
        [
          "*** Begin Patch",
          "*** Update File: example.txt",
          "@@",
          " one",
          "two",
          "*** End Patch",
        ].join("\n"),
        workspace
      )
    ).rejects.toThrow("Invalid hunk line");
    expect(await fs.readFile(filePath, "utf8")).toBe("one\ntwo\n");
  });

  test("appends insertion-only hunks and normalizes a final newline", async () => {
    const workspace = await createWorkspace();
    const filePath = path.join(workspace, "example.txt");
    await fs.writeFile(filePath, "first", "utf8");

    await applyPatch(
      `*** Begin Patch
*** Update File: example.txt
@@
+second
*** End Patch`,
      workspace
    );

    expect(await fs.readFile(filePath, "utf8")).toBe("first\nsecond\n");
  });

  test("keeps insertion-only hunks at the end when a later hunk grows the file", async () => {
    const workspace = await createWorkspace();
    const filePath = path.join(workspace, "example.txt");
    const original = "alpha\nbeta\ngamma\ndelta\n";
    const expected = "alpha\nbeta one\nbeta two\ngamma\ndelta\nomega\n";
    const insertion = "@@\n+omega";
    const edit = "@@\n alpha\n-beta\n+beta one\n+beta two\n gamma";
    const patch = (...hunks: string[]) =>
      `*** Begin Patch\n*** Update File: example.txt\n${hunks.join("\n")}\n*** End Patch`;

    await fs.writeFile(filePath, original, "utf8");
    await applyPatch(patch(edit, insertion), workspace);
    expect(await fs.readFile(filePath, "utf8")).toBe(expected);

    await fs.writeFile(filePath, original, "utf8");
    await applyPatch(patch(insertion, edit), workspace);
    expect(await fs.readFile(filePath, "utf8")).toBe(expected);
  });

  test("can remove the complete contents of a file", async () => {
    const workspace = await createWorkspace();
    const filePath = path.join(workspace, "example.txt");
    await fs.writeFile(filePath, "only\n", "utf8");

    await applyPatch(
      `*** Begin Patch
*** Update File: example.txt
@@
-only
*** End Patch`,
      workspace
    );

    expect(await fs.readFile(filePath, "utf8")).toBe("");
  });
});
