import { describe, expect, test } from "bun:test";

import { createNodeAgentEnvironmentProbe } from "../../src/agent-status/node-environment";

describe("createNodeAgentEnvironmentProbe", () => {
  test("将 Python 版本命令拆分为可执行文件和参数", async () => {
    const calls: { executable: string; args: readonly string[] }[] = [];
    const probe = createNodeAgentEnvironmentProbe({
      platform: "win32",
      arch: "x64",
      env: { COMSPEC: "C:\\Windows\\System32\\cmd.exe" },
      now: () => new Date("2026-08-19T02:03:04.000Z"),
      async runExecutable(executable, args) {
        calls.push({ executable, args });
        return "Python 3.12.8";
      },
    });

    const snapshot = await probe.inspect({
      workingDirectory: "C:\\work\\llm-space",
    });

    expect(snapshot.pythonVersion).toBe("Python 3.12.8");
    expect(calls).toEqual([{ executable: "python", args: ["--version"] }]);
  });
});
