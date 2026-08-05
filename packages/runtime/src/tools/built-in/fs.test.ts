import { afterEach, describe, expect, mock, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { edit, glob, grep, ls, present_files, read, tree, write } from "./fs";

const testDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    testDirectories.splice(0).map((dir) =>
      fs.rm(dir, { recursive: true, force: true })
    )
  );
});

describe("filesystem built-in paths", () => {
  test("write and edit use absolute paths directly", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "llm-space-fs-test-")
    );
    testDirectories.push(directory);
    const absolutePath = path.join(directory, "example.txt");

    await write(absolutePath, "before");
    await edit(absolutePath, "before", "after");

    expect(await fs.readFile(absolutePath, "utf8")).toBe("after");
  });

  test("write and edit expand a leading home shortcut", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.homedir(), ".llm-space-fs-test-")
    );
    testDirectories.push(directory);
    const fileName = "nested/example.txt";
    const absolutePath = path.join(directory, fileName);
    const homePath = `~/${path.relative(os.homedir(), absolutePath)}`;

    expect(await write(homePath, "before")).toBe(
      `Wrote 6 bytes to ${absolutePath}`
    );
    expect(await fs.readFile(absolutePath, "utf8")).toBe("before");

    expect(await edit(homePath, "before", "after")).toBe(
      `Replaced 1 occurrence in ${absolutePath}`
    );
    expect(await fs.readFile(absolutePath, "utf8")).toBe("after");
  });

  test("present_files expands home paths before opening or revealing", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.homedir(), ".llm-space-fs-test-")
    );
    testDirectories.push(directory);
    const relativeDirectory = path.relative(os.homedir(), directory);
    const htmlPath = path.join(directory, "report.html");
    const textPath = path.join(directory, "notes.txt");
    const openPath = mock(() => undefined);
    const revealPath = mock(() => Promise.resolve());

    await present_files(
      [`~/${relativeDirectory}/report.html`, `~/${relativeDirectory}/notes.txt`],
      { openPath, revealPath }
    );

    expect(openPath).toHaveBeenCalledWith(htmlPath);
    expect(revealPath).toHaveBeenCalledWith(textPath);
  });

  test("read, traversal, and search tools expand home paths", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.homedir(), ".llm-space-fs-test-")
    );
    testDirectories.push(directory);
    const absolutePath = path.join(directory, "example.txt");
    const homeDirectory = `~/${path.relative(os.homedir(), directory)}`;
    const homePath = `${homeDirectory}/example.txt`;
    await fs.writeFile(absolutePath, "search target", "utf8");

    expect(await read(homePath)).toBe("1\tsearch target");
    expect(await ls(homeDirectory)).toBe("example.txt");
    expect(await tree(homeDirectory)).toContain("└── example.txt");
    expect(await grep("target", homeDirectory)).toContain(absolutePath);
    expect(await glob("*.txt", homeDirectory, "/unused")).toBe(absolutePath);
  });
});
