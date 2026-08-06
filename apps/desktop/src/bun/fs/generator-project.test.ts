import { expect, mock, test } from "bun:test";
import path from "node:path";

import {
  authorizeGeneratorDir,
  openGeneratorDevTerminal,
} from "./generator-project";

test("generated project terminal launch is unsupported outside macOS", async () => {
  const runAppleScript = mock<
    (script: string, args: string[]) => Promise<void>
  >(() => Promise.resolve());

  expect(
    await openGeneratorDevTerminal("/untrusted/project", {
      platform: "linux",
      runAppleScript,
    })
  ).toBe(false);
  expect(runAppleScript).not.toHaveBeenCalled();
});

test("macOS opens Terminal in an authorized project and runs make dev", async () => {
  const projectDir = path.resolve(
    "/tmp/llm-space-project with spaces and 'quote'"
  );
  authorizeGeneratorDir(projectDir);
  const runAppleScript = mock<
    (script: string, args: string[]) => Promise<void>
  >(() => Promise.resolve());

  expect(
    await openGeneratorDevTerminal(projectDir, {
      platform: "darwin",
      runAppleScript,
    })
  ).toBe(true);
  expect(runAppleScript).toHaveBeenCalledTimes(1);
  const [script, args] = runAppleScript.mock.calls[0];
  expect(script).toContain("quoted form of projectDir");
  expect(script).toContain('" && make dev"');
  expect(args).toEqual([projectDir]);
});

test("macOS refuses to launch an unauthorized project directory", () => {
  expect(
    openGeneratorDevTerminal("/tmp/not-authorized", {
      platform: "darwin",
      runAppleScript: () => Promise.resolve(),
    })
  ).rejects.toThrow("Directory is not authorized");
});
