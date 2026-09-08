import { expect, test } from "bun:test";
import path from "node:path";

test("provider image settings mounted UI regressions", () => {
  // UI module mocks must not leak into other suites in Bun's shared module cache.
  const result = Bun.spawnSync({
    cmd: [
      process.execPath,
      "test",
      path.join(import.meta.dir, "provider-image-settings.fixture.tsx"),
    ],
    stdout: "pipe",
    stderr: "pipe",
    timeout: 20_000,
  });
  const output =
    new TextDecoder().decode(result.stdout) +
    new TextDecoder().decode(result.stderr);
  expect(result.exitCode, output).toBe(0);
}, 25_000);
