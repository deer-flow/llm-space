import { describe, expect, test } from "bun:test";

import { bash, createFsBuiltInTools } from "./fs";

const BASE_DEPENDENCIES = {
  findSkill: () => null,
  workspaceRoot: "C:/workspace",
};

describe("Bash capability", () => {
  test("does not advertise bash when the host cannot resolve it", () => {
    expect(
      createFsBuiltInTools({ ...BASE_DEPENDENCIES, bashPath: null }).map(
        (entry) => entry.tool.name
      )
    ).not.toContain("bash");
  });

  test("returns an actionable error when direct execution has no Bash", () => {
    expect(bash("echo hello", undefined, null)).rejects.toThrow(
      "Bash is unavailable"
    );
  });

  test("executes the exact resolved path even when it contains spaces", async () => {
    const calls: { command: string; args: string[]; timeout?: number }[] = [];
    const result = await bash(
      "printf hello",
      42,
      "C:/Program Files/Git/bin/bash.exe",
      (command, args, timeout) => {
        calls.push({ command, args, timeout });
        return Promise.resolve({ stdout: "hello", stderr: "", code: 0 });
      }
    );

    expect(calls).toEqual([
      {
        command: "C:/Program Files/Git/bin/bash.exe",
        args: ["-c", "printf hello"],
        timeout: 42,
      },
    ]);
    expect(result).toEqual({ stdout: "hello", stderr: "", exitCode: 0 });
  });
});
