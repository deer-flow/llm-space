import { describe, expect, test } from "bun:test";

import { buildMcpToolName } from "./mcp";

describe("buildMcpToolName", () => {
  test("uses the server prefix by default", () => {
    expect(buildMcpToolName({ serverName: "web", toolName: "web_fetch" })).toBe(
      "mcp__web__web_fetch"
    );
  });

  test("can expose the original tool name without a prefix", () => {
    expect(
      buildMcpToolName({
        serverName: "web",
        toolName: "web_fetch",
        useOriginalToolNames: true,
      })
    ).toBe("web_fetch");
  });
});
