import { afterEach, describe, expect, mock, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  bash,
  edit,
  glob,
  grep,
  ls,
  present_files,
  read,
  tree,
  write,
} from "../../../src/tools/built-in/fs";

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

describe("subprocess and glob output caps", () => {
  test("bash truncates stdout past the cap with a marker", async () => {
    const { stdout, exitCode } = await bash("seq 1 60000", os.tmpdir());

    expect(exitCode).toBe(0);
    expect(stdout.length).toBeLessThan(280_000);
    expect(stdout).toContain(
      "[truncated at 262144 bytes; redirect output to a file and read ranges with the read tool]"
    );
  });

  test("bash truncates stderr past the cap with a marker", async () => {
    const { stderr, exitCode } = await bash("seq 1 60000 >&2", os.tmpdir());

    expect(exitCode).toBe(0);
    expect(stderr).toContain("[truncated at 262144 bytes");
    expect(stderr.length).toBeLessThan(280_000);
  });

  test("bash keeps short output byte-identical", async () => {
    const { stdout, stderr, exitCode } = await bash(
      "printf out; printf err >&2; exit 3",
      os.tmpdir()
    );

    expect(stdout).toBe("out");
    expect(stderr).toBe("err");
    expect(exitCode).toBe(3);
  });

  const cap = 256 * 1024;
  const marker = `\n... [truncated at ${cap} bytes; redirect output to a file and read ranges with the read tool]`;

  for (const stream of ["stdout", "stderr"] as const) {
    for (const size of [cap - 1, cap, cap + 1]) {
      test(`${stream} handles ${size} bytes at the cap boundary`, async () => {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), "llm-space-cap-"));
        testDirectories.push(directory);
        await fs.writeFile(path.join(directory, "input"), "a".repeat(size));
        const result = await bash(
          `cat input${stream === "stderr" ? " >&2" : ""}`,
          directory
        );
        expect(result.exitCode).toBe(0);
        expect(result[stream]).toBe(
          "a".repeat(Math.min(size, cap)) + (size > cap ? marker : "")
        );
      });
    }
    for (const character of ["é", "中", "😀"]) {
      for (let keptBytes = 1; keptBytes <= Buffer.byteLength(character); keptBytes++) {
        test(`${stream} preserves UTF-8 with ${keptBytes} bytes of ${character} at the boundary`, async () => {
          const directory = await fs.mkdtemp(path.join(os.tmpdir(), "llm-space-utf8-"));
          testDirectories.push(directory);
          const prefix = "a".repeat(cap - keptBytes);
          await fs.writeFile(path.join(directory, "input"), prefix + character + "tail");
          const result = await bash(
            `cat input${stream === "stderr" ? " >&2" : ""}`,
            directory
          );
          const expected = prefix + (keptBytes === Buffer.byteLength(character) ? character : "");
          expect(result.exitCode).toBe(0);
          expect(result[stream]).toBe(expected + marker);
          expect(Buffer.byteLength(expected)).toBeLessThanOrEqual(cap);
        });
      }
    }
  }

  test("bash drains both streams after truncation and preserves the exit code", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "llm-space-drain-"));
    testDirectories.push(directory);
    await fs.writeFile(path.join(directory, "input"), "x".repeat(4 * 1024 * 1024));
    const result = await bash("cat input & cat input >&2 & wait; exit 7", directory, 5000);
    expect(result.exitCode).toBe(7);
    expect(result.stdout).toBe("x".repeat(cap) + marker);
    expect(result.stderr).toBe("x".repeat(cap) + marker);
  });

  test("grep caps multibyte matching output", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "llm-space-grep-cap-"));
    testDirectories.push(directory);
    await fs.writeFile(path.join(directory, "input"), "中文匹配\n".repeat(40000));
    const result = await grep("匹配", directory);
    expect(result.endsWith(marker)).toBe(true);
    expect(result).not.toContain("\ufffd");
    expect(Buffer.byteLength(result.slice(0, -marker.length))).toBeLessThanOrEqual(cap);
  });

  test("glob caps results and reports the total", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "llm-space-glob-cap-")
    );
    testDirectories.push(directory);
    for (let i = 0; i < 205; i++) {
      await fs.writeFile(path.join(directory, `file-${i}.txt`), "x", "utf8");
    }

    const result = await glob("*.txt", directory, "/unused");
    const lines = result.split("\n");

    expect(lines).toHaveLength(201);
    expect(lines[200]).toBe(
      "... [showing first 200 of 205 matches; narrow the pattern or target directory]"
    );
  });
});
