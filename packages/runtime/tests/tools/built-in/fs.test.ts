import { afterEach, describe, expect, mock, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createFsBuiltInTools,
  edit,
  glob,
  grep,
  ls,
  present_files,
  read,
  resolveBashExecutable,
  tree,
  write,
} from "../../../src/tools/built-in/fs";
import { ToolRegistry } from "../../../src/tools/tool-registry";

const testDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    testDirectories
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true }))
  );
});

describe("filesystem built-in paths", () => {
  test("Windows 优先使用可用的 Git Bash", () => {
    const configured = "D:\\Portable\\Git\\bin\\bash.exe";
    const standard = "C:\\Program Files\\Git\\bin\\bash.exe";

    expect(
      resolveBashExecutable({
        platform: "win32",
        env: {
          GIT_BASH: configured,
          ProgramFiles: "C:\\Program Files",
        },
        exists: (candidate) =>
          candidate === configured || candidate === standard,
      })
    ).toBe(configured);
    expect(
      resolveBashExecutable({
        platform: "win32",
        env: {
          GIT_BASH: "D:\\Missing\\bash.exe",
          ProgramFiles: "C:\\Program Files",
        },
        exists: (candidate) => candidate === standard,
      })
    ).toBe(standard);
    expect(
      resolveBashExecutable({
        platform: "win32",
        env: {},
        exists: () => false,
      })
    ).toBe("bash");
    expect(
      resolveBashExecutable({
        platform: "linux",
        env: { GIT_BASH: configured },
        exists: () => true,
      })
    ).toBe("bash");
  });

  test("bash 使用跟踪 cwd 并返回不泄露内部标记的目录 effect", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "llm-space-bash-status-")
    );
    testDirectories.push(directory);
    const trackedDirectory = path.join(directory, "tracked");
    await fs.mkdir(trackedDirectory);
    const expectedDirectory = await fs.realpath(directory);
    const registry = new ToolRegistry();
    registry.register({
      id: "fixture.fs",
      entries: createFsBuiltInTools({
        workspaceRoot: directory,
        findSkill: () => null,
      }),
    });
    registry.freeze();

    const response = await registry.call({
      name: "bash",
      arguments: {
        description: "验证 cwd 跟踪",
        command: 'printf "%s\\n" "$PWD"; cd ..',
      },
      config: { workingDirectory: trackedDirectory },
    });

    expect(response.effects).toEqual([
      {
        type: "working-directory",
        workingDirectory: expectedDirectory,
      },
    ]);
    const content = response.content[0];
    if (content?.type !== "text") {
      throw new Error("bash 必须返回文本结果。");
    }
    expect(content.text.includes("__LLM_SPACE_CWD_")).toBe(false);
    const output = JSON.parse(content.text) as {
      stdout: string;
      stderr: string;
      exitCode: number;
    };
    expect(output.exitCode).toBe(0);
    expect(
      output.stdout
        .replaceAll("\\", "/")
        .trimEnd()
        .toLowerCase()
        .endsWith("/tracked")
    ).toBe(true);
  });

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
      [
        `~/${relativeDirectory}/report.html`,
        `~/${relativeDirectory}/notes.txt`,
      ],
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
