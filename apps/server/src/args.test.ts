import { describe, expect, test } from "bun:test";

import { parseArgs } from "./args";

describe("parseArgs", () => {
  test("parses explicit server arguments", () => {
    expect(
      parseArgs([
        "--host",
        "127.0.0.1",
        "--port",
        "39123",
        "--token",
        "test-token",
        "--home",
        "/tmp/llm-space-server-test",
      ])
    ).toMatchObject({
      host: "127.0.0.1",
      port: 39123,
      token: "test-token",
      home: "/tmp/llm-space-server-test",
      help: false,
    });
  });

  test("requires token unless help is requested", () => {
    expect(() => parseArgs([])).toThrow("--token is required.");
    expect(parseArgs(["--help"]).help).toBe(true);
  });

  test("rejects invalid ports", () => {
    expect(() => parseArgs(["--port", "nope", "--token", "x"])).toThrow(
      "--port must be an integer"
    );
  });
});
