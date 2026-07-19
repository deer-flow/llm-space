import { join } from "node:path";

const SCRIPTS = [
  "fix-x64-headerpad.ts",
  "fix-macos-deployment-target.ts",
] as const;

for (const script of SCRIPTS) {
  const result = Bun.spawnSync(
    [process.execPath, join(import.meta.dir, script)],
    {
      cwd: process.cwd(),
      env: process.env,
      stderr: "inherit",
      stdout: "inherit",
    }
  );
  if (result.exitCode !== 0) process.exit(result.exitCode);
}
