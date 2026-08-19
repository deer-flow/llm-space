import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { LocalStorageManager } from "./local-storage-manager";

const testDirs: string[] = [];

afterEach(() => {
  for (const dir of testDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createSettingsPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "llm-space-local-storage-"));
  testDirs.push(dir);
  return path.join(dir, "settings", "local-storage.json");
}

describe("LocalStorageManager", () => {
  test("migrates legacy browser values only when the file is missing", () => {
    const settingsPath = createSettingsPath();
    const manager = new LocalStorageManager(settingsPath);

    expect(manager.snapshot()).toEqual({ initialized: false, values: {} });
    expect(manager.initialize({ "llm-space-theme": "light" })).toEqual({
      initialized: true,
      values: { "llm-space-theme": "light" },
    });
    expect(
      manager.initialize({ "llm-space-theme": "dark" }).values
    ).toEqual({ "llm-space-theme": "light" });
  });

  test("persists sets and removals across manager instances", () => {
    const settingsPath = createSettingsPath();
    const manager = new LocalStorageManager(settingsPath);
    manager.initialize({ "llm-space-theme": "dark" });

    manager.setItem("llm-space-theme", "light");
    manager.setItem("llm-space:active-tab", "thread-1");
    manager.removeItem("llm-space:active-tab");

    expect(new LocalStorageManager(settingsPath).snapshot()).toEqual({
      initialized: true,
      values: { "llm-space-theme": "light" },
    });
    expect(JSON.parse(readFileSync(settingsPath, "utf8"))).toEqual({
      "llm-space-theme": "light",
    });
  });
});
