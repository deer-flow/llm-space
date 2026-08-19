import path from "node:path";

for (const script of [
  "install-macos-deep-link-launcher.ts",
  "fix-x64-headerpad.ts",
]) {
  const result = Bun.spawnSync([process.execPath, path.join(import.meta.dir, script)], {
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) process.exit(result.exitCode);
}
