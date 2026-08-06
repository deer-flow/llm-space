import { describe, expect, test } from "bun:test";

import type { PluginSubprocessHost } from "./plugin-subprocess-host";
import { ThreadStorageRegistry } from "./thread-storage-registry";

const host = {} as PluginSubprocessHost;

describe("ThreadStorageRegistry deep links", () => {
  test("registers and removes a plugin-owned deep-link id", () => {
    const registry = new ThreadStorageRegistry();
    registry.replacePlugin("aurora", host, [
      {
        id: "plugin:aurora:thread-storage:aurora",
        deepLinkId: "aurora",
        displayName: "Aurora Thread Storage",
        capabilities: { read: true, write: false },
      },
    ]);

    expect(registry.findByDeepLinkId("aurora")?.id).toBe(
      "plugin:aurora:thread-storage:aurora"
    );
    registry.removePlugin("aurora");
    expect(registry.findByDeepLinkId("aurora")).toBeUndefined();
  });

  test("rejects duplicate and invalid deep-link ids", () => {
    const registry = new ThreadStorageRegistry();
    registry.registerBuiltin({
      id: "builtin:first",
      deepLinkId: "aurora",
      displayName: "First",
      reader: {
        resolveLatest: (id) => Promise.resolve({ id }),
        read: () => Promise.resolve({ title: "First" }),
      },
    });

    expect(() =>
      registry.replacePlugin("second", host, [
        {
          id: "plugin:second:thread-storage:second",
          deepLinkId: "aurora",
          displayName: "Second",
          capabilities: { read: true, write: false },
        },
      ])
    ).toThrow("Duplicate Thread Storage deep-link id: aurora");
    expect(() =>
      registry.registerBuiltin({
        id: "builtin:invalid",
        deepLinkId: "Not Valid",
        displayName: "Invalid",
      })
    ).toThrow("Invalid Thread Storage deep-link id: Not Valid");
  });
});
