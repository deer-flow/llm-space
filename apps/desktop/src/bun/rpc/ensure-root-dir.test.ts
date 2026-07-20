import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "bun:test";

import { ensureRootDir } from "./ensure-root-dir";

describe("ensureRootDir", () => {
  test.each(["workspace", "tmp/deep-research"])(
    "keeps valid nested path %s inside LLM_SPACE_HOME",
    (relativePath) => {
      const homePath = mkdtempSync(path.join(tmpdir(), "llm-space-home-"));

      try {
        const resolved = ensureRootDir(homePath, relativePath);

        expect(resolved).toBe(path.join(homePath, relativePath));
        expect(existsSync(resolved)).toBe(true);
        expect(resolved.startsWith(homePath + path.sep)).toBe(true);
      } finally {
        rmSync(homePath, { recursive: true, force: true });
      }
    }
  );

  test.each([
    "../outside",
    "tmp/../../outside",
    "/tmp/outside",
    String.raw`..\outside`,
    String.raw`C:\outside`,
    String.raw`\\server\share`,
  ])("rejects escape attempt %s", (relativePath) => {
    const homePath = path.resolve(tmpdir(), "llm-space-home");

    expect(() => ensureRootDir(homePath, relativePath)).toThrow(
      `Path escapes LLM_SPACE_HOME: ${relativePath}`
    );
  });
});
