import { existsSync } from "node:fs";
import path from "node:path";

import rcedit from "rcedit";

const headerpad = Bun.spawnSync([
  process.execPath,
  path.join(import.meta.dir, "fix-x64-headerpad.ts"),
], {
  cwd: path.join(import.meta.dir, ".."),
  env: process.env,
  stdio: ["ignore", "inherit", "inherit"],
});
if (headerpad.exitCode !== 0) {
  throw new Error(`fix-x64-headerpad exited with code ${headerpad.exitCode}`);
}

if (process.env.ELECTROBUN_OS === "win") {
  const buildDirectory = _requiredEnv("ELECTROBUN_BUILD_DIR");
  const appName = _requiredEnv("ELECTROBUN_APP_NAME");
  const icon = path.resolve(import.meta.dir, "..", "icon.ico");
  const binaries = [
    path.join(buildDirectory, appName, "bin", "launcher.exe"),
    path.join(buildDirectory, appName, "bin", "bun.exe"),
  ];
  for (const binary of binaries) {
    if (!existsSync(binary)) {
      throw new Error(`Windows app binary not found for icon embedding: ${binary}`);
    }
    await rcedit(binary, { icon });
    console.info(`Embedded Windows icon: ${path.basename(binary)}`);
  }
}

function _requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in Electrobun build hook.`);
  return value;
}
