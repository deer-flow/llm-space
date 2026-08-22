import path from "node:path";

// postPackage hooks, run in order. Each script no-ops off its platform:
// build-wizard-installer.ts compiles the Inno Setup wizard installer (the
// primary Windows deliverable); repackage-windows-artifacts.ts re-embeds the
// icon into electrobun's own Setup exe and refreshes its zip + artifact copy.
for (const script of [
  "build-wizard-installer.ts",
  "repackage-windows-artifacts.ts",
]) {
  const result = Bun.spawnSync(
    [process.execPath, path.join(import.meta.dir, script)],
    {
      env: process.env,
      stdout: "inherit",
      stderr: "inherit",
    }
  );
  if (result.exitCode !== 0) process.exit(result.exitCode);
}
