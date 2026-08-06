import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { McpServerConfig, McpServerReadiness } from "@llm-space/core";

import { McpManager } from "./mcp-manager";

const originalLlmSpaceHome = process.env.LLM_SPACE_HOME;
const roots: string[] = [];

interface McpManagerTestAccess {
  _setServerReadiness(
    serverId: string,
    readiness: McpServerReadiness
  ): McpServerConfig;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  if (originalLlmSpaceHome === undefined) {
    delete process.env.LLM_SPACE_HOME;
  } else {
    process.env.LLM_SPACE_HOME = originalLlmSpaceHome;
  }
});

describe.serial("McpManager plugin readiness", () => {
  test("restores plugin tool discovery without copying plugin secrets", async () => {
    const home = _home();
    const server = _pluginServer({
      env: { AURORA_TOKEN: "TOP_SECRET_VALUE" },
    });
    const readiness = _readiness();

    const first = new McpManager();
    await first.setPluginServers([{ pluginId: "aurora", server }]);
    (first as unknown as McpManagerTestAccess)._setServerReadiness(
      server.id,
      readiness
    );

    const cache = readFileSync(
      path.join(home, "settings", "mcp-plugin-readiness.json"),
      "utf8"
    );
    expect(cache).not.toContain("TOP_SECRET_VALUE");

    const restarted = new McpManager();
    await restarted.setPluginServers([{ pluginId: "aurora", server }]);

    expect(restarted.listServers()[0]?.readiness).toEqual(readiness);
  });

  test("keeps tools but marks them stale when plugin configuration changes", async () => {
    _home();
    const server = _pluginServer();
    const first = new McpManager();
    await first.setPluginServers([{ pluginId: "aurora", server }]);
    (first as unknown as McpManagerTestAccess)._setServerReadiness(
      server.id,
      _readiness()
    );

    const restarted = new McpManager();
    await restarted.setPluginServers([
      {
        pluginId: "aurora",
        server: { ...server, command: "aurora-next" },
      },
    ]);

    expect(restarted.listServers()[0]?.readiness).toMatchObject({
      status: "stale",
      toolCount: 1,
      tools: [{ directName: "mcp__plugin_aurora_mcp_aurora__inspect" }],
    });
  });
});

function _home(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "llm-space-mcp-"));
  roots.push(root);
  process.env.LLM_SPACE_HOME = root;
  return root;
}

function _pluginServer(
  overrides: Partial<McpServerConfig> = {}
): McpServerConfig {
  return {
    id: "plugin:aurora:mcp:aurora",
    name: "Aurora Built-in Tools",
    serverName: "plugin_aurora_mcp_aurora",
    transport: "stdio",
    command: "aurora",
    args: ["mcp"],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function _readiness(): McpServerReadiness {
  return {
    status: "ready",
    testedAt: 1_700_000_000_000,
    toolCount: 1,
    tools: [
      {
        toolName: "inspect",
        normalizedToolName: "inspect",
        directName: "mcp__plugin_aurora_mcp_aurora__inspect",
        description: "Inspect the current app",
        inputSchema: {
          type: "object",
          properties: { target: { type: "string" } },
        },
        requiredFields: [],
        topLevelProperties: ["target"],
        available: true,
      },
    ],
  };
}
