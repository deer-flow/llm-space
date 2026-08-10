import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { LocalRuntimeClient } from "../../src/runtime/local-runtime-client";

const TMP = mkdtempSync(path.join(os.tmpdir(), "llm-space-runtime-text-"));

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("LocalRuntimeClient prompt files", () => {
  test("reads arbitrary text and reports readable regular files", async () => {
    const file = path.join(TMP, "prompt.md");
    writeFileSync(file, "runtime contents", "utf8");
    const client = new LocalRuntimeClient({} as never);

    expect(await client.readTextFile(file)).toBe("runtime contents");
    expect(await client.textFileExists(file)).toBe(true);
    expect(await client.readTextFile(path.join(TMP, "missing.md"))).toBe("");
    expect(await client.textFileExists(TMP)).toBe(false);
  });
});
