import path from "node:path";

// postWrap hooks, run in order. Each script no-ops off its platform:
// fix-x64-headerpad.ts only touches macOS x64 builds, fix-windows-tar.ts
// only touches Windows builds.
for (const script of ["fix-x64-headerpad.ts", "fix-windows-tar.ts"]) {
  const result = Bun.spawnSync([process.execPath, path.join(import.meta.dir, script)], {
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) process.exit(result.exitCode);
}
