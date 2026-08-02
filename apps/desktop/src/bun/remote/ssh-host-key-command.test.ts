import { describe, expect, test } from "bun:test";

import { runSshHostKeyCommand } from "./ssh-host-key-command";

describe("runSshHostKeyCommand", () => {
  test("settles after a bounded timeout when a descendant keeps stderr open", async () => {
    const startedAt = performance.now();
    const result = await _withDeadline(
      runSshHostKeyCommand(
        "/bin/sh",
        ["-c", "(sleep 1) >&2 & while :; do :; done"],
        { timeoutMs: 20, postKillDrainMs: 40 }
      ),
      300
    );

    expect(result.code).toBeNull();
    expect(result.stderr).toContain("SSH host key probe timed out after 20ms.");
    expect(performance.now() - startedAt).toBeLessThan(300);
  });
});

async function _withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Command did not settle within ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
