import { afterEach, describe, expect, test } from "bun:test";
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import {
  atomicWriteJsonFile,
  readJsonFile,
  readJsonFileSync,
} from "../../src/server/json-file";

const TEMP_DIRS: string[] = [];

async function _tempDir(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "llm-space-json-"));
  TEMP_DIRS.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    TEMP_DIRS.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("persisted JSON files", () => {
  test("backs up and repairs truncated JSON", async () => {
    const directory = await _tempDir();
    const filePath = path.join(directory, "state.json");
    await writeFile(filePath, '{"enabled":false,"count":2,"unfinished');

    const result = await readJsonFile(filePath, {
      schema: z.object({
        enabled: z.boolean(),
        count: z.number(),
      }),
      recovery: "best-effort",
    });

    expect(result.source).toBe("recovered");
    expect(result.value).toEqual({ enabled: false, count: 2 });
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(result.value);
    const files = await readdir(directory);
    expect(files.some((name) => name.startsWith("state.json.corrupt-"))).toBe(
      true
    );
  });

  test("uses a validated fallback for an invalid shape", async () => {
    const directory = await _tempDir();
    const filePath = path.join(directory, "settings.json");
    await writeFile(filePath, '{"enabled":"yes"}');

    const result = readJsonFileSync(filePath, {
      schema: z.object({ enabled: z.boolean() }),
      recovery: "best-effort",
      fallback: () => ({ enabled: false }),
    });

    expect(result.source).toBe("fallback");
    expect(result.value).toEqual({ enabled: false });
  });

  test("preserves owner-only permissions for sensitive files", async () => {
    const directory = await _tempDir();
    const filePath = path.join(directory, "auth.json");
    await atomicWriteJsonFile(filePath, { token: "secret" }, { mode: 0o600 });
    await chmod(filePath, 0o600);

    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });
});
