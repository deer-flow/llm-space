import { describe, expect, test } from "bun:test";

import { createAgentEnvironmentProbe } from "../../src/agent-status/environment";

describe("createAgentEnvironmentProbe", () => {
  test("reports Windows COMSPEC and the primary Python version", async () => {
    const commands: string[] = [];
    const probe = createAgentEnvironmentProbe({
      platform: "win32",
      arch: "x64",
      env: { COMSPEC: "C:\\Windows\\System32\\cmd.exe" },
      async runVersion(command) {
        commands.push(command);
        return command === "python --version" ? "Python 3.12.8" : null;
      },
      now: () => new Date("2026-08-19T02:03:04.000Z"),
    });

    expect(
      await probe.inspect({ workingDirectory: "C:\\work\\llm-space" })
    ).toEqual({
      currentTime: "2026-08-19T02:03:04.000Z",
      workingDirectory: "C:\\work\\llm-space",
      platform: "win32",
      arch: "x64",
      shell: "C:\\Windows\\System32\\cmd.exe",
      pythonVersion: "Python 3.12.8",
    });
    expect(commands).toEqual(["python --version"]);
  });

  test("reports Unix SHELL and falls back from python to python3", async () => {
    const commands: string[] = [];
    const probe = createAgentEnvironmentProbe({
      platform: "linux",
      arch: "arm64",
      env: { SHELL: "/bin/zsh" },
      async runVersion(command) {
        commands.push(command);
        return command === "python3 --version" ? "Python 3.11.9" : null;
      },
      now: () => new Date("2026-08-19T03:04:05.000Z"),
    });

    expect(await probe.inspect({ workingDirectory: "/srv/llm-space" })).toEqual(
      {
        currentTime: "2026-08-19T03:04:05.000Z",
        workingDirectory: "/srv/llm-space",
        platform: "linux",
        arch: "arm64",
        shell: "/bin/zsh",
        pythonVersion: "Python 3.11.9",
      }
    );
    expect(commands).toEqual(["python --version", "python3 --version"]);
  });

  test("uses unavailable when shell and Python cannot be detected", async () => {
    const commands: string[] = [];
    const probe = createAgentEnvironmentProbe({
      platform: "darwin",
      arch: "x64",
      env: {},
      async runVersion(command) {
        commands.push(command);
        return null;
      },
      now: () => new Date("2026-08-19T04:05:06.000Z"),
    });

    expect(
      await probe.inspect({ workingDirectory: "/Users/test/project" })
    ).toEqual({
      currentTime: "2026-08-19T04:05:06.000Z",
      workingDirectory: "/Users/test/project",
      platform: "darwin",
      arch: "x64",
      shell: "unavailable",
      pythonVersion: "unavailable",
    });
    expect(commands).toEqual(["python --version", "python3 --version"]);
  });

  test("caches static detection while refreshing time and cwd per inspect", async () => {
    const commands: string[] = [];
    const times = [
      new Date("2026-08-19T05:00:00.000Z"),
      new Date("2026-08-19T05:01:00.000Z"),
    ];
    let timeIndex = 0;
    const probe = createAgentEnvironmentProbe({
      platform: "linux",
      arch: "x64",
      env: { SHELL: "/bin/bash" },
      async runVersion(command) {
        commands.push(command);
        return "Python 3.13.0";
      },
      now: () => times[timeIndex++],
    });

    const first = await probe.inspect({ workingDirectory: "/work/first" });
    const second = await probe.inspect({ workingDirectory: "/work/second" });

    expect(first.currentTime).toBe("2026-08-19T05:00:00.000Z");
    expect(first.workingDirectory).toBe("/work/first");
    expect(second.currentTime).toBe("2026-08-19T05:01:00.000Z");
    expect(second.workingDirectory).toBe("/work/second");
    expect(second.pythonVersion).toBe("Python 3.13.0");
    expect(commands).toEqual(["python --version"]);
  });
});
