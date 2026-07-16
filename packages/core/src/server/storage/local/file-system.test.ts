import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { LocalFileSystem } from "./file-system";

const TEMP_DIRS: string[] = [];

async function _createFileSystem(): Promise<LocalFileSystem> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "llm-space-test-"));
  TEMP_DIRS.push(root);
  return new LocalFileSystem(root);
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

    expect(fs.readFile(fileSystem.realpath("alpha.json"), "utf8")).resolves.toBe(
      "alpha"
    );
    expect(fs.readFile(fileSystem.realpath("beta.json"), "utf8")).resolves.toBe(
      "beta"
    );
  });
});
