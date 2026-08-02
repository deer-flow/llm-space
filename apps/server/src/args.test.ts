import { describe, expect, test } from "bun:test";

import { parseArgs, resolveServerToken } from "./args";

const SENTINEL_TOKEN = "sentinel-runtime-token-do-not-leak";

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

  test("accepts a mutually exclusive protected stdin token source", async () => {
    const args = parseArgs(["--token-stdin"]);

    expect(args.token).toBeUndefined();
    expect(args.tokenStdin).toBe(true);
    expect(() =>
      parseArgs(["--token", SENTINEL_TOKEN, "--token-stdin"])
    ).toThrow("Choose exactly one token source");
    expect(
      await resolveServerToken(args, () =>
        Promise.resolve(`${SENTINEL_TOKEN}\n`)
      )
    ).toBe(SENTINEL_TOKEN);
  });

  test("rejects empty protected stdin without echoing its contents", () => {
    const args = parseArgs(["--token-stdin"]);

    expect(
      resolveServerToken(args, () => Promise.resolve("\n"))
    ).rejects.toThrow("standard input is empty");
  });

  test("rejects invalid ports", () => {
    expect(() => parseArgs(["--port", "nope", "--token", "x"])).toThrow(
      "--port must be an integer"
    );
  });
});
