import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ExecCodeSessionManager,
  execCodeTool,
} from "../../../src/tools/built-in/exec-code";

const TEMP_DIRS: string[] = [];
const MANAGERS: ExecCodeSessionManager[] = [];

afterEach(async () => {
  await Promise.all(MANAGERS.splice(0).map((manager) => manager.shutdown()));
  await Promise.all(
    TEMP_DIRS.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

async function setup(): Promise<{
  directory: string;
  manager: ExecCodeSessionManager;
}> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "exec-code-tool-"));
  TEMP_DIRS.push(directory);
  const manager = new ExecCodeSessionManager(directory);
  MANAGERS.push(manager);
  return { directory, manager };
}

describe("exec_code built-in tool", () => {
  test("keeps Python variables and returns the last expression", async () => {
    const { manager } = await setup();
    const first = await manager.execute({
      runtime: "python",
      code: "values = [2, 3, 5]\nsum(values)",
      sessionId: null,
    });
    expect(first).toMatchObject({
      execution_count: 1,
      stdout: "",
      stderr: "",
      result: "10",
      exit_code: 0,
    });

    const second = await manager.execute({
      runtime: "python",
      code: "values.append(7)\nvalues",
      sessionId: first.session_id,
    });
    expect(second).toMatchObject({
      session_id: first.session_id,
      execution_count: 2,
      result: "[2, 3, 5, 7]",
      exit_code: 0,
    });
  });

  test("supports per-cell cwd and retains cwd changes", async () => {
    const { directory, manager } = await setup();
    const nested = path.join(directory, "nested");
    await mkdir(nested);
    const expectedNested = await realpath(nested);
    const first = await manager.execute({
      runtime: "python",
      code: "import os\nos.getcwd()",
      sessionId: null,
      cwd: "nested",
    });
    expect(first.cwd).toBe(expectedNested);
    expect(first.result).toBe(repr(expectedNested));

    const second = await manager.execute({
      runtime: "python",
      code: "os.getcwd()",
      sessionId: first.session_id,
    });
    expect(second.cwd).toBe(expectedNested);
    expect(second.result).toBe(repr(expectedNested));
  });

  test("keeps Bun TypeScript variables in the current app runtime", async () => {
    const { manager } = await setup();
    const first = await manager.execute({
      runtime: "bun",
      code: "let answer: number = 40; answer + 1",
      sessionId: null,
    });
    expect(first).toMatchObject({ result: "41", exit_code: 0 });

    const second = await manager.execute({
      runtime: "bun",
      code: "answer + 2",
      sessionId: first.session_id,
    });
    expect(second).toMatchObject({
      session_id: first.session_id,
      execution_count: 2,
      result: "42",
      exit_code: 0,
    });
  });

  test("destroys a session after a timeout", async () => {
    const { manager } = await setup();
    const first = await manager.execute({
      runtime: "python",
      code: "value = 1",
      sessionId: null,
    });
    expect(
      manager.execute({
        runtime: "python",
        code: "import time; time.sleep(1)",
        sessionId: first.session_id,
        timeoutMs: 10,
      })
    ).rejects.toThrow("session");
    await Bun.sleep(20);
    expect(
      manager.execute({
        runtime: "python",
        code: "value",
        sessionId: first.session_id,
      })
    ).rejects.toThrow("not found or expired");
  });

  test("publishes notebook parameters in model-facing order", () => {
    const parameters = execCodeTool.parameters as {
      required: string[];
      properties: Record<
        string,
        { enum?: string[]; default?: number; description?: string }
      >;
      additionalProperties: boolean;
    };
    expect(Object.keys(parameters.properties)).toEqual([
      "description",
      "runtime",
      "code",
      "session_id",
      "cwd",
      "timeout_ms",
    ]);
    expect(parameters.required).toEqual([
      "description",
      "runtime",
      "code",
      "session_id",
    ]);
    expect(parameters.properties.runtime?.enum).toEqual(["python", "bun"]);
    expect(parameters.properties.timeout_ms?.default).toBe(120_000);
    expect(execCodeTool.description).toContain("notebook-style session");
    expect(execCodeTool.description).toContain("CodeAct-style workflows");
    expect(execCodeTool.description).toContain(
      "arithmetic and scientific calculations"
    );
    expect(execCodeTool.description).toContain(
      'data analysis, use runtime "python" and reuse the returned session_id'
    );
    expect(parameters.properties.code?.description).toContain("require()");
    expect(parameters.additionalProperties).toBe(false);
  });
});

function repr(value: string): string {
  return `'${value}'`;
}
