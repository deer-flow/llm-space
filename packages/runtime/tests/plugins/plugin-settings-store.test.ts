import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { PluginSettingsStore } from "../../src/plugins/plugin-settings-store";

const roots: string[] = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true }))
);

describe("PluginSettingsStore", () => {
  test("defaults unknown plugins to enabled without creating the file", () => {
    const home = _home();
    expect(new PluginSettingsStore(home).get("demo")).toEqual({
      enabled: true,
      settings: {},
    });
    expect(() =>
      readFileSync(path.join(home, "settings", "plugins.json"))
    ).toThrow();
  });

  test("writes schemaVersion, enabled and settings atomically", () => {
    const home = _home();
    const store = new PluginSettingsStore(home);
    store.setEnabled("demo", false);
    store.setSettings("demo", { endpoint: "local" });
    expect(
      JSON.parse(
        readFileSync(path.join(home, "settings", "plugins.json"), "utf8")
      )
    ).toEqual({
      schemaVersion: 1,
      plugins: { demo: { enabled: false, settings: { endpoint: "local" } } },
    });
  });

  test("recovers from last-known-good and preserves a damaged original", () => {
    const home = _home();
    const first = new PluginSettingsStore(home);
    first.setEnabled("demo", false);
    const file = path.join(home, "settings", "plugins.json");
    writeFileSync(file, "{ damaged", "utf8");
    const recovered = new PluginSettingsStore(home);
    expect(recovered.loadError).toBeUndefined();
    expect(recovered.get("demo").enabled).toBe(false);
    expect(readFileSync(file, "utf8")).toBe("{ damaged");
  });

  test("disables plugin loading when neither primary nor backup is valid", () => {
    const home = _home();
    const settings = path.join(home, "settings");
    mkdirSync(settings, { recursive: true });
    writeFileSync(path.join(settings, "plugins.json"), "bad");
    writeFileSync(path.join(settings, "plugins.json.last-good"), "bad");
    expect(new PluginSettingsStore(home).loadError).toBeInstanceOf(Error);
  });
});

function _home(): string {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "llm-space-plugin-settings-")
  );
  roots.push(root);
  return root;
}
