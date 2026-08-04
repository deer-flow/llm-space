import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { PluginSubprocessHost } from "./plugin-subprocess-host";

const roots: string[] = [];
const hosts: PluginSubprocessHost[] = [];
interface LoadResult {
  commands: { id: string; displayName: string }[];
  storages: { id: string; displayName: string; deepLinkId?: string }[];
  errors: { id: string; kind: string }[];
}
afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.shutdown()));
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe("PluginSubprocessHost", () => {
  test("loads TS commands once and executes through NDJSON RPC", async () => {
    const root = _root();
    const command = path.join(root, "commands", "hello.ts");
    mkdirSync(path.dirname(command));
    writeFileSync(
      command,
      `export default class Hello { displayName = "Hello"; count = 0; execute(ctx) { console.log("plugin output"); this.count++; return { count: this.count, setting: ctx.settings.value }; } }`
    );
    const host = _host();
    const loaded = await host.call<LoadResult>("initialize", {
      settings: { value: "ok" },
      commands: [{ id: "plugin:demo:command:hello", path: command }],
      storages: [],
    });
    expect(loaded.commands[0].displayName).toBe("Hello");
    expect(
      await host.call<unknown>("command.execute", {
        id: "plugin:demo:command:hello",
      })
    ).toEqual({ count: 1, setting: "ok" });
    expect(
      await host.call<unknown>("command.execute", {
        id: "plugin:demo:command:hello",
      })
    ).toEqual({ count: 2, setting: "ok" });
  });

  test("isolates invalid files while retaining valid extensions", async () => {
    const root = _root();
    mkdirSync(path.join(root, "commands"));
    const good = path.join(root, "commands", "good.mjs");
    const bad = path.join(root, "commands", "bad.js");
    writeFileSync(
      good,
      `export default class Good { displayName = "Good"; execute() { return "yes"; } }`
    );
    writeFileSync(bad, `throw new Error("broken import")`);
    const loaded = await _host().call<LoadResult>("initialize", {
      settings: {},
      commands: [
        { id: "good", path: good },
        { id: "bad", path: bad },
      ],
      storages: [],
    });
    expect(loaded.commands.map((item) => item.id)).toEqual(["good"]);
    expect(loaded.errors[0]).toMatchObject({ id: "bad", kind: "command" });
  });

  test("loads read-write Thread Storage classes", async () => {
    const root = _root();
    const storage = path.join(root, "storage.mjs");
    writeFileSync(
      storage,
      `export default class Memory { displayName = "Memory"; deepLinkId = "memory"; capabilities = { read: true, write: true }; resolveLatest(id) { return { id }; } read(locator) { return { title: locator.id, messages: [], tools: [] }; } write(thread, id) { return { id: id || thread.title }; } }`
    );
    const host = _host();
    const loaded = await host.call<LoadResult>("initialize", {
      settings: {},
      commands: [],
      storages: [{ id: "storage", path: storage }],
    });
    expect(loaded.storages[0]?.displayName).toBe("Memory");
    expect(loaded.storages[0]?.deepLinkId).toBe("memory");
    expect(
      await host.call<unknown>("storage.write", {
        id: "storage",
        thread: { title: "new", messages: [], tools: [] },
      })
    ).toEqual({ id: "new" });
  });

  test("restarts once for the next call after a runner crash", async () => {
    const root = _root();
    const commands = path.join(root, "commands");
    mkdirSync(commands);
    const good = path.join(commands, "good.js");
    const crash = path.join(commands, "crash.js");
    writeFileSync(
      good,
      `export default class Good { displayName = "Good"; execute() { return "restored"; } }`
    );
    writeFileSync(
      crash,
      `export default class Crash { displayName = "Crash"; execute() { process.exit(71); } }`
    );
    const host = _host();
    await host.call("initialize", {
      settings: {},
      commands: [
        { id: "good", path: good },
        { id: "crash", path: crash },
      ],
      storages: [],
    });
    const crashError = await host
      .call("command.execute", { id: "crash" })
      .catch((error: unknown) => error);
    expect(crashError).toBeInstanceOf(Error);
    if (!(crashError instanceof Error))
      throw new Error("Expected runner error");
    expect(crashError.message).toContain("exited with code 71");
    expect(await host.call<unknown>("command.execute", { id: "good" })).toBe(
      "restored"
    );
  });
});

function _root(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "llm-space-plugin-runner-"));
  roots.push(root);
  return root;
}

function _host(): PluginSubprocessHost {
  const host = new PluginSubprocessHost(
    path.join(import.meta.dir, "plugin-runner.ts"),
    "demo",
    () => Promise.resolve(null)
  );
  hosts.push(host);
  return host;
}
