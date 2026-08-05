import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { discoverPlugins } from "./plugin-discovery";
import { PluginLogger } from "./plugin-logger";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("discoverPlugins", () => {
  test("discovers plain and scoped packages at fixed depth", () => {
    const home = _home();
    _plugin(home, "plain-plugin");
    _plugin(home, "@vendor/scoped-plugin");
    _plugin(home, "outer/nested/ignored");
    const result = _discover(home);
    expect(result.plugins.map((plugin) => plugin.id)).toEqual([
      "@vendor/scoped-plugin",
      "plain-plugin",
    ]);
  });

  test("rejects mismatched names, incompatible versions and symlinks", () => {
    const home = _home();
    _plugin(home, "wrong-folder", { name: "different-name" });
    _plugin(home, "future", { engines: { "llm-space": ">=99" } });
    const outside = path.join(home, "outside");
    mkdirSync(outside);
    writeFileSync(
      path.join(outside, "package.json"),
      JSON.stringify(_metadata("linked"))
    );
    symlinkSync(outside, path.join(home, "plugins", "linked"));
    const result = _discover(home);
    expect(result.failures).toHaveLength(2);
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0]?.compatible).toBe(false);
  });

  test("discovers only direct extension files", () => {
    const home = _home();
    const root = _plugin(home, "extensions");
    mkdirSync(path.join(root, "commands", "nested"), { recursive: true });
    writeFileSync(
      path.join(root, "commands", "one.ts"),
      "export default class {}\n"
    );
    writeFileSync(
      path.join(root, "commands", "nested", "two.ts"),
      "export default class {}\n"
    );
    mkdirSync(path.join(root, "tools", "nested"), { recursive: true });
    writeFileSync(
      path.join(root, "tools", "project.ts"),
      "export default class {}\n"
    );
    writeFileSync(
      path.join(root, "tools", "nested", "ignored.ts"),
      "export default class {}\n"
    );
    expect(
      _discover(home).plugins[0]?.commandPaths.map((filePath) =>
        path.basename(filePath)
      )
    ).toEqual(["one.ts"]);
    expect(
      _discover(home).plugins[0]?.toolPaths.map((filePath) =>
        path.basename(filePath)
      )
    ).toEqual(["project.ts"]);
  });

  test("rejects non-SemVer versions and symlinked extension directories", () => {
    const home = _home();
    _plugin(home, "bad-version", { version: "1" });
    const linked = _plugin(home, "linked-extensions");
    const outside = path.join(home, "outside-commands");
    mkdirSync(outside);
    symlinkSync(outside, path.join(linked, "commands"));
    expect(
      _discover(home)
        .failures.map((failure) => failure.id)
        .sort()
    ).toEqual(["bad-version", "linked-extensions"]);
  });

  test("embeds a valid PNG icon and ignores invalid image data", () => {
    const home = _home();
    const valid = _plugin(home, "valid-icon");
    writeFileSync(
      path.join(valid, "icon.png"),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64"
      )
    );
    const invalid = _plugin(home, "invalid-icon");
    writeFileSync(path.join(invalid, "icon.png"), "not a png");

    const result = _discover(home);
    expect(result.failures).toEqual([]);
    expect(
      result.plugins.find((plugin) => plugin.id === "valid-icon")?.iconDataUrl
    ).toStartWith("data:image/png;base64,");
    expect(
      result.plugins.find((plugin) => plugin.id === "invalid-icon")?.iconDataUrl
    ).toBeUndefined();
  });
});

function _home(): string {
  const home = mkdtempSync(
    path.join(os.tmpdir(), "llm-space-plugin-discovery-")
  );
  roots.push(home);
  mkdirSync(path.join(home, "plugins"), { recursive: true });
  return home;
}

function _plugin(
  home: string,
  name: string,
  override: Record<string, unknown> = {}
): string {
  const root = path.join(home, "plugins", ...name.split("/"));
  mkdirSync(root, { recursive: true });
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ ..._metadata(name), ...override })
  );
  return root;
}

function _metadata(name: string) {
  return { name, version: "1.2.3", engines: { "llm-space": ">=4 <5" } };
}

function _discover(home: string) {
  return discoverPlugins({
    pluginsPath: path.join(home, "plugins"),
    appVersion: "4.7.1",
    logger: new PluginLogger(home, "4.7.1"),
  });
}
