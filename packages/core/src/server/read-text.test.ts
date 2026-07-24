import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";


import { expandHomePath } from "./paths";
import {
  readUserTextFile,
  userDirectoryExists,
  userTextFileExists,
} from "./read-text";

const tmp = mkdtempSync(path.join(os.tmpdir(), "llm-space-readtext-"));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("expandHomePath", () => {
  test("expands a leading ~", () => {
    expect(expandHomePath("~")).toBe(os.homedir());
    expect(expandHomePath("~/notes/x.md")).toBe(
      path.join(os.homedir(), "notes/x.md")
    );
  });

  test("leaves absolute and mid-path tildes untouched", () => {
    expect(expandHomePath("/abs/path.md")).toBe("/abs/path.md");
    expect(expandHomePath("./a/~b")).toBe("./a/~b");
    expect(expandHomePath("~user/x")).toBe("~user/x");
  });
});

describe("readUserTextFile", () => {
  test("reads an existing file", async () => {
    const file = path.join(tmp, "note.md");
    writeFileSync(file, "hello world", "utf8");
    expect(await readUserTextFile(file)).toBe("hello world");
  });

  test("returns '' for a missing file", async () => {
    expect(await readUserTextFile(path.join(tmp, "nope.md"))).toBe("");
  });

  test("returns '' for a directory or empty input", async () => {
    expect(await readUserTextFile(tmp)).toBe("");
    expect(await readUserTextFile("")).toBe("");
  });
});

describe("userTextFileExists", () => {
  test("returns true for readable regular files, including empty files", async () => {
    const file = path.join(tmp, "empty.md");
    writeFileSync(file, "", "utf8");
    expect(await userTextFileExists(file)).toBe(true);
  });

  test("returns false for missing paths, directories, and empty input", async () => {
    expect(await userTextFileExists(path.join(tmp, "missing.md"))).toBe(false);
    expect(await userTextFileExists(tmp)).toBe(false);
    expect(await userTextFileExists("")).toBe(false);
  });
});

describe("userDirectoryExists", () => {
  test("returns true for an existing directory", async () => {
    expect(await userDirectoryExists(tmp)).toBe(true);
  });

  test("returns false for missing paths, regular files, and empty input", async () => {
    const file = path.join(tmp, "not-a-directory.md");
    writeFileSync(file, "", "utf8");
    expect(await userDirectoryExists(path.join(tmp, "missing"))).toBe(false);
    expect(await userDirectoryExists(file)).toBe(false);
    expect(await userDirectoryExists("")).toBe(false);
  });
});
