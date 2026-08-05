import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { PluginSubprocessHost } from "./plugin-subprocess-host";

const roots: string[] = [];
const hosts: PluginSubprocessHost[] = [];
interface LoadResult {
  commands: { id: string; displayName: string }[];
  tools: {
    id: string;
    name: string;
    description: string;
    parameters: object;
    strict?: boolean;
  }[];
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
    ).toEqual({ result: { count: 1, setting: "ok" } });
    expect(
      await host.call<unknown>("command.execute", {
        id: "plugin:demo:command:hello",
      })
    ).toEqual({ result: { count: 2, setting: "ok" } });
  });

  test("exposes and stages the invocation's active thread", async () => {
    const root = _root();
    const command = path.join(root, "commands", "thread.ts");
    mkdirSync(path.dirname(command));
    writeFileSync(
      command,
      `export default class ThreadCommand {
        displayName = "Thread";
        async execute(ctx, args) {
          const { filename, thread } = ctx.activeTab;
          thread.title = "updated";
          await ctx.activeTab.writeThread(thread);
          return {
            filename,
            workingDirectory: thread.context.variables.current_working_directory.value,
            contextArguments: ctx.arguments,
            arguments: args,
          };
        }
      }`
    );
    const host = _host();
    await host.call("initialize", {
      settings: {},
      commands: [{ id: "thread", path: command }],
      storages: [],
    });

    expect(
      await host.call<unknown>("command.execute", {
        id: "thread",
        arguments: ["skill", "abc", "123"],
        activeTab: {
          filename: "original.json",
          thread: {
            title: "original",
            context: {
              variables: {
                current_working_directory: {
                  type: "workingDirectory",
                  value: "/workspace",
                },
              },
            },
          },
        },
      })
    ).toEqual({
      result: {
        filename: "original.json",
        workingDirectory: "/workspace",
        contextArguments: ["skill", "abc", "123"],
        arguments: ["skill", "abc", "123"],
      },
      activeTabThreadUpdate: {
        title: "updated",
        context: {
          variables: {
            current_working_directory: {
              type: "workingDirectory",
              value: "/workspace",
            },
          },
        },
      },
    });
  });

  test("exposes a null active tab when no thread is active", async () => {
    const root = _root();
    const command = path.join(root, "commands", "no-thread.ts");
    mkdirSync(path.dirname(command));
    writeFileSync(
      command,
      `export default class NoThread {
        displayName = "No thread";
        async execute(ctx) {
          return { activeTab: ctx.activeTab };
        }
      }`
    );
    const host = _host();
    await host.call("initialize", {
      settings: {},
      commands: [{ id: "no-thread", path: command }],
      storages: [],
    });

    expect(
      await host.call<unknown>("command.execute", {
        id: "no-thread",
        activeTab: null,
      })
    ).toEqual({
      result: {
        activeTab: null,
      },
    });
  });

  test("executes Plugin Tools with frozen owning context and structured results", async () => {
    const root = _root();
    const tool = path.join(root, "tools", "project-info.ts");
    mkdirSync(path.dirname(tool));
    writeFileSync(
      tool,
      `export default class ProjectInfo {
        name = "project_info";
        description = "Read project context";
        parameters = { type: "object", properties: {} };
        strict = true;
        execute(context, args) {
          return context.createResult([{ type: "text", text: JSON.stringify({
            title: context.thread.title,
            cwd: context.variables.current_working_directory,
            args,
            frozen: Object.isFrozen(context.thread) && Object.isFrozen(context.thread.context) && Object.isFrozen(context.variables),
          }) }]);
        }
      }`
    );
    const host = _host();
    const loaded = await host.call<LoadResult>("initialize", {
      settings: {},
      commands: [],
      tools: [{ id: "plugin:demo:tool:project-info", path: tool }],
      storages: [],
    });

    expect(loaded.tools).toEqual([
      {
        id: "plugin:demo:tool:project-info",
        name: "project_info",
        description: "Read project context",
        parameters: { type: "object", properties: {} },
        strict: true,
      },
    ]);
    expect(
      await host.call<unknown>("tool.execute", {
        id: "plugin:demo:tool:project-info",
        thread: { title: "Owning thread", context: {} },
        variables: { current_working_directory: "/workspace" },
        arguments: { detail: true },
      })
    ).toEqual({
      kind: "content",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            title: "Owning thread",
            cwd: "/workspace",
            args: { detail: true },
            frozen: true,
          }),
        },
      ],
    });
  });

  test("times out a Plugin Tool call and disposes Tool instances on shutdown", async () => {
    const root = _root();
    const marker = path.join(root, "disposed.txt");
    const tool = path.join(root, "tools", "slow.ts");
    mkdirSync(path.dirname(tool));
    writeFileSync(
      tool,
      `export default class Slow {
        name = "slow";
        description = "Wait";
        parameters = { type: "object", properties: {} };
        async execute() { await Bun.sleep(250); return "done"; }
        async dispose() { await Bun.write(${JSON.stringify(marker)}, "disposed"); }
      }`
    );
    const host = _host();
    const initialization = {
      settings: {},
      commands: [],
      tools: [{ id: "plugin:demo:tool:slow", path: tool }],
      storages: [],
    };
    await host.call("initialize", initialization);

    const error = await host
      .call(
        "tool.execute",
        {
          id: "plugin:demo:tool:slow",
          thread: { context: {} },
          variables: {},
          arguments: {},
        },
        20
      )
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).toHaveProperty(
      "message",
      "Plugin request timed out: tool.execute"
    );

    // The timed-out runner was terminated. Reload a fresh instance, then prove
    // the normal shutdown lifecycle invokes the Tool hook.
    await host.call("initialize", initialization);
    await host.shutdown();
    expect(readFileSync(marker, "utf8")).toBe("disposed");
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
    expect(await host.call<unknown>("command.execute", { id: "good" })).toEqual(
      { result: "restored" }
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
