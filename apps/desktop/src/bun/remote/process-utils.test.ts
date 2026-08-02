import { describe, expect, test } from "bun:test";
import { once } from "node:events";

import { spawnManagedProcess } from "./process-utils";

const SENTINEL_TOKEN = "sentinel-runtime-token-do-not-leak";

describe("spawnManagedProcess", () => {
  test("delivers sensitive stdin without adding it to child argv and closes the pipe", async () => {
    const process = spawnManagedProcess(
      "stdin reader",
      "/bin/sh",
      ["-c", 'IFS= read -r value; printf %s "$value"; sleep 5'],
      { stdinInput: `${SENTINEL_TOKEN}\n` }
    );

    if (!process.output()) {
      await once(process.child.stdout!, "data");
    }

    expect(process.child.spawnargs.join("\0")).not.toContain(SENTINEL_TOKEN);
    expect(process.output()).toBe(SENTINEL_TOKEN);
    expect(process.child.stdin?.writableEnded).toBe(true);
    expect(process.child.stdin?.destroyed).toBe(true);
    expect(process.child.exitCode).toBeNull();

    await process.stop();
  });

  test("closes sensitive stdin when the child exits before reading it", async () => {
    const process = spawnManagedProcess(
      "early exit",
      "/bin/sh",
      ["-c", "exit 7"],
      { stdinInput: `${SENTINEL_TOKEN.repeat(4096)}\n` }
    );

    await once(process.child, "exit");

    expect(process.child.stdin?.writableEnded).toBe(true);
    expect(process.child.stdin?.destroyed).toBe(true);
    expect(process.output()).not.toContain(SENTINEL_TOKEN);
  });
});
