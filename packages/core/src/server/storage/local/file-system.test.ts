import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import type { Thread } from "../../../types";

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
                type: "image_data",
                data: imageData,
                mimeType: "image/png",
              },
              {
                type: "image_data",
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
});
