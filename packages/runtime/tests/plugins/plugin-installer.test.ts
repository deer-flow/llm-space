import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { strToU8, zipSync } from "fflate";

import { installPluginZip } from "../../src/plugins/plugin-installer";

const homes: string[] = [];

afterEach(async () => {
  await Promise.all(
    homes.splice(0).map((home) => rm(home, { recursive: true, force: true }))
  );
});

describe("installPluginZip", () => {
  test("uses package name and replaces an existing plugin directory", async () => {
    const homePath = await _home();
    const target = path.join(homePath, "plugins", "aurora-plugins");
    const first = zipSync({
      "aurora-plugin/package.json": strToU8(
        JSON.stringify({ name: "aurora-plugins", version: "1.0.0" })
      ),
      "aurora-plugin/old.txt": strToU8("old"),
      "__MACOSX/aurora-plugin/._package.json": strToU8("metadata"),
    });
    const installed = await installPluginZip({ homePath, archive: first });
    expect(installed).toEqual({
      pluginId: "aurora-plugins",
      version: "1.0.0",
      path: target,
    });
    expect(await readFile(path.join(target, "old.txt"), "utf8")).toBe("old");

    const second = zipSync({
      "renamed-root/package.json": strToU8(
        JSON.stringify({ name: "aurora-plugins", version: "2.0.0" })
      ),
      "renamed-root/new.txt": strToU8("new"),
    });
    await installPluginZip({ homePath, archive: second });
    expect(await readFile(path.join(target, "new.txt"), "utf8")).toBe("new");
    expect(readFile(path.join(target, "old.txt"), "utf8")).rejects.toThrow();
  });

  test("installs scoped package names below their scope directory", async () => {
    const homePath = await _home();
    const archive = zipSync({
      "package.json": strToU8(
        JSON.stringify({ name: "@acme/reviewer", version: "1.0.0" })
      ),
      "tool.ts": strToU8("export default {}"),
    });
    const result = await installPluginZip({ homePath, archive });
    expect(result.path).toBe(
      path.join(homePath, "plugins", "@acme", "reviewer")
    );
    expect(await readFile(path.join(result.path, "tool.ts"), "utf8")).toBe(
      "export default {}"
    );
  });

  test("rejects paths that escape the temporary extraction directory", async () => {
    const homePath = await _home();
    const outside = path.join(homePath, "escape.txt");
    const archive = zipSync({
      "../escape.txt": strToU8("escape"),
      "package.json": strToU8(JSON.stringify({ name: "safe-plugin" })),
    });
    expect(installPluginZip({ homePath, archive })).rejects.toThrow(
      "Unsafe path"
    );
    expect(readFile(outside, "utf8")).rejects.toThrow();
  });

  test("leaves an existing plugin untouched when validation fails", async () => {
    const homePath = await _home();
    const target = path.join(homePath, "plugins", "keep-plugin", "value.txt");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "keep");
    const archive = zipSync({
      "package.json": strToU8(
        JSON.stringify({ name: "Invalid Name", version: "1.0.0" })
      ),
    });
    expect(installPluginZip({ homePath, archive })).rejects.toThrow(
      "Invalid npm package name"
    );
    expect(await readFile(target, "utf8")).toBe("keep");
  });
});

async function _home(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "plugin-installer-test-"));
  homes.push(home);
  return home;
}
