import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import type { PluginToolExtension } from "@llm-space/core";

import { withMemoryStoreLock } from "../../../src/bun/memory/store-lock";
import {
  LEGACY_MEMORY_PLUGIN_HASHES,
  MEMORY_PLUGIN_FILES,
  MEMORY_PLUGIN_ID,
} from "../../../src/bun/plugins/memory-plugin-files";
import { seedDefaultPlugins } from "../../../src/bun/plugins/seed";

import legacyFiles from "./fixtures/memory-v1.json";

const roots: string[] = [];
const originalHome = process.env.LLM_SPACE_HOME;

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
  if (originalHome === undefined) delete process.env.LLM_SPACE_HOME;
  else process.env.LLM_SPACE_HOME = originalHome;
});

function fixture() {
  const home = mkdtempSync(path.join(os.tmpdir(), "memory-storage-"));
  roots.push(home);
  const plugins = path.join(home, "plugins");
  const plugin = path.join(plugins, ...MEMORY_PLUGIN_ID.split("/"));
  const data = path.join(home, "data/plugins/@llm-space/memory");
  mkdirSync(data, { recursive: true });
  return {
    home,
    plugins,
    plugin,
    data,
    store: path.join(data, "memories.jsonl"),
  };
}

function installFiles(
  root: string,
  files: readonly { path: string; content: string }[]
) {
  for (const file of files) {
    const target = path.join(root, file.path);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, file.content);
  }
}

// Exact bundled 1.0 source from f2bb156; hashes ensure this really exercises
// the shipped legacy format, with neither config.schema.json nor a marker.
test("upgrades an untouched 1.0 installation and preserves its memory data", () => {
  const f = fixture();
  for (const file of legacyFiles) {
    expect(createHash("sha256").update(file.content).digest("hex")).toBe(
      LEGACY_MEMORY_PLUGIN_HASHES[file.path]
    );
  }
  installFiles(f.plugin, legacyFiles);
  writeFileSync(f.store, "user memory fixture\n");
  seedDefaultPlugins(f.plugins);
  for (const file of MEMORY_PLUGIN_FILES) {
    expect(readFileSync(path.join(f.plugin, file.path), "utf8")).toBe(
      file.content
    );
  }
  expect(readFileSync(f.store, "utf8")).toBe("user memory fixture\n");
});

test("upgrades marker-owned old files without requiring newly added files", () => {
  const f = fixture();
  installFiles(f.plugin, legacyFiles);
  writeFileSync(
    path.join(f.plugin, ".llm-space-seed.json"),
    JSON.stringify({ files: LEGACY_MEMORY_PLUGIN_HASHES })
  );
  seedDefaultPlugins(f.plugins);
  expect(readFileSync(path.join(f.plugin, "package.json"), "utf8")).toBe(
    MEMORY_PLUGIN_FILES[0].content
  );
});

test.each(["edited", "deleted", "new-file-collision"])(
  "preserves %s user changes during upgrade",
  (change) => {
    const f = fixture();
    installFiles(f.plugin, legacyFiles);
    writeFileSync(
      path.join(f.plugin, ".llm-space-seed.json"),
      JSON.stringify({ files: LEGACY_MEMORY_PLUGIN_HASHES })
    );
    const target = path.join(f.plugin, "tools/memory-save.ts");
    if (change === "edited") writeFileSync(target, "// user customization\n");
    if (change === "deleted") rmSync(target);
    if (change === "new-file-collision")
      writeFileSync(path.join(f.plugin, "config.schema.json"), "user settings");
    seedDefaultPlugins(f.plugins);
    expect(readFileSync(path.join(f.plugin, "package.json"), "utf8")).toBe(
      legacyFiles[0].content
    );
    if (change === "edited")
      expect(readFileSync(target, "utf8")).toBe("// user customization\n");
    if (change === "deleted") expect(existsSync(target)).toBe(false);
    if (change === "new-file-collision")
      expect(
        readFileSync(path.join(f.plugin, "config.schema.json"), "utf8")
      ).toBe("user settings");
  }
);

test("archive failure leaves every active memory intact and allows a safe retry", async () => {
  const f = fixture();
  seedDefaultPlugins(f.plugins);
  process.env.LLM_SPACE_HOME = f.home;
  const module = (await import(
    path.join(f.plugin, "tools/memory-save.ts")
  )) as { default: new () => PluginToolExtension };
  const save = new module.default();
  const records = Array.from({ length: 1000 }, (_, index) => ({
    id: `old-${index}`,
    content: `record ${index}`,
    tags: [],
    origin: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  }));
  const original =
    records.map((record) => JSON.stringify(record)).join("\n") + "\n";
  writeFileSync(f.store, original);
  const archive = path.join(f.data, "memories.archive.jsonl");
  mkdirSync(archive); // Make archive IO fail without relying on Unix permissions.
  const notifications: unknown[] = [];
  const context = {
    variables: {},
    settings: { duplicateSimilarity: 2 },
    notify: (value: unknown) => {
      notifications.push(value);
    },
  } as unknown as Parameters<PluginToolExtension["execute"]>[0];
  expect(
    await save.execute(context, { content: "brand new preference" })
  ).toMatchObject({ saved: false });
  expect(readFileSync(f.store, "utf8")).toBe(original);
  expect(notifications).toEqual([]);
  rmSync(archive, { recursive: true });
  expect(
    await save.execute(context, { content: "brand new preference" })
  ).toMatchObject({ saved: true, evicted: 1, archived: true });
  expect(JSON.parse(readFileSync(archive, "utf8").trim())).toMatchObject(
    records[0]
  );
  expect(readFileSync(f.store, "utf8").trim().split("\n")).toHaveLength(1000);
});

async function waitForFile(file: string) {
  const deadline = Date.now() + 5000;
  while (!existsSync(file)) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${file}`);
    await Bun.sleep(10);
  }
}

// Force the exact lost-update interleaving: plugin reads, desktop tries to
// edit/delete, plugin commits. Desktop must read only after the plugin commits.
test("desktop mutations serialize with a real plugin subprocess", async () => {
  const f = fixture();
  seedDefaultPlugins(f.plugins);
  writeFileSync(
    f.store,
    ["edit", "delete"]
      .map((id) =>
        JSON.stringify({
          id,
          content: id,
          tags: [],
          origin: null,
          createdAt: "2026-01-01",
        })
      )
      .join("\n") + "\n"
  );
  const ready = path.join(f.home, "ready");
  const release = path.join(f.home, "release");
  const desktopStarted = path.join(f.home, "desktop-started");
  const desktopDone = path.join(f.home, "desktop-done");
  const pluginScript = `
    import fs from "node:fs";
    const [store, ready, release, toolPath] = Bun.argv.slice(1);
    const { default: Tool } = await import(toolPath);
    const read = fs.readFileSync;
    fs.readFileSync = function(file, ...args) {
      const result = read.call(fs, file, ...args);
      if (file === store) {
        fs.writeFileSync(ready, "ready");
        const deadline = Date.now() + 5000;
        while (!fs.existsSync(release)) {
          if (Date.now() > deadline) throw new Error("Release timed out");
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
        }
      }
      return result;
    };
    const result = new Tool().execute({ variables: {}, settings: {} }, { content: "saved by plugin" });
    if (!result.saved) throw new Error(JSON.stringify(result));
  `;
  const desktopScript = `
    import fs from "node:fs";
    const [modulePath, started, done] = Bun.argv.slice(1);
    const { updateMemory, deleteMemory } = await import(modulePath);
    fs.writeFileSync(started, "started");
    if (!updateMemory({id: "edit", content: "edited by desktop"}).ok) throw new Error("Edit failed");
    if (!deleteMemory("delete").ok) throw new Error("Delete failed");
    fs.writeFileSync(done, "done");
  `;
  const env = { ...process.env, LLM_SPACE_HOME: f.home };
  const plugin = Bun.spawn(
    [
      process.execPath,
      "--eval",
      pluginScript,
      f.store,
      ready,
      release,
      path.join(f.plugin, "tools/memory-save.ts"),
    ],
    { env, stdout: "pipe", stderr: "pipe" }
  );
  let desktop: ReturnType<typeof Bun.spawn> | undefined;
  try {
    await waitForFile(ready);
    desktop = Bun.spawn(
      [
        process.execPath,
        "--eval",
        desktopScript,
        path.resolve(import.meta.dir, "../../../src/bun/memory/index.ts"),
        desktopStarted,
        desktopDone,
      ],
      { env, stdout: "pipe", stderr: "pipe" }
    );
    await waitForFile(desktopStarted);
    await Bun.sleep(100);
    expect(existsSync(desktopDone)).toBe(false);
    writeFileSync(release, "release");
    expect(await plugin.exited, await new Response(plugin.stderr).text()).toBe(
      0
    );
    expect(await desktop.exited).toBe(0);
    const records = readFileSync(f.store, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { id: string; content: string });
    expect(records).toHaveLength(2);
    expect(records.find((record) => record.id === "edit")?.content).toBe(
      "edited by desktop"
    );
    expect(records.some((record) => record.content === "saved by plugin")).toBe(
      true
    );
    expect(records.some((record) => record.id === "delete")).toBe(false);
  } finally {
    plugin.kill();
    desktop?.kill();
    await plugin.exited;
    if (desktop) await desktop.exited;
  }
}, 15_000);

test("a terminated writer does not leave a stale lock", async () => {
  const f = fixture();
  const ready = path.join(f.home, "ready");
  const script = `
    import fs from "node:fs";
    const [modulePath, directory, ready] = Bun.argv.slice(1);
    const { withMemoryStoreLock } = await import(modulePath);
    withMemoryStoreLock(directory, () => {
      fs.writeFileSync(ready, "locked");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000);
    });
  `;
  const child = Bun.spawn(
    [
      process.execPath,
      "--eval",
      script,
      path.resolve(import.meta.dir, "../../../src/bun/memory/store-lock.ts"),
      f.data,
      ready,
    ],
    { stdout: "pipe", stderr: "pipe" }
  );
  try {
    await waitForFile(ready);
    child.kill("SIGKILL");
    await child.exited;
    expect(withMemoryStoreLock(f.data, () => "recovered")).toBe("recovered");
  } finally {
    child.kill();
    await child.exited;
  }
});
