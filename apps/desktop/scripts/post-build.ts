import { existsSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

import rcedit from "rcedit";

import {
  patchWindowsExecutableFileToConsole,
  patchWindowsExecutableFileToGui,
} from "./windows-executable";

const headerpad = Bun.spawnSync(
  [process.execPath, path.join(import.meta.dir, "fix-x64-headerpad.ts")],
  {
    cwd: path.join(import.meta.dir, ".."),
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
  }
);
if (headerpad.exitCode !== 0) {
  throw new Error(`fix-x64-headerpad exited with code ${headerpad.exitCode}`);
}

if (process.env.ELECTROBUN_OS === "win") {
  const buildDirectory = _requiredEnv("ELECTROBUN_BUILD_DIR");
  const appName = _requiredEnv("ELECTROBUN_APP_NAME");
  const binDirectory = path.join(buildDirectory, appName, "bin");
  const icon = path.resolve(import.meta.dir, "..", "icon.ico");
  const launcher = path.join(binDirectory, "launcher.exe");
  const coreLauncher = path.join(binDirectory, "launcher-core.exe");
  const bundledBun = path.join(binDirectory, "bun.exe");
  for (const binary of [launcher, bundledBun]) {
    if (!existsSync(binary)) {
      throw new Error(`Windows app binary not found: ${binary}`);
    }
  }

  rmSync(coreLauncher, { force: true });
  renameSync(launcher, coreLauncher);
  _compileWindowsLauncher(launcher, icon);

  for (const binary of [launcher, coreLauncher, bundledBun]) {
    await rcedit(binary, { icon });
  }
  patchWindowsExecutableFileToConsole(coreLauncher);
  for (const binary of [launcher, bundledBun]) {
    patchWindowsExecutableFileToGui(binary);
    console.info(`Configured Windows GUI subsystem: ${path.basename(binary)}`);
  }
  console.info("Wrapped launcher-core.exe with a console-free launcher.exe");
}

function _requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in Electrobun build hook.`);
  return value;
}

function _compileWindowsLauncher(output: string, icon: string): void {
  const windowsDirectory = process.env.WINDIR ?? "C:\\Windows";
  const candidates = [
    path.join(
      windowsDirectory,
      "Microsoft.NET",
      "Framework64",
      "v4.0.30319",
      "csc.exe"
    ),
    path.join(
      windowsDirectory,
      "Microsoft.NET",
      "Framework",
      "v4.0.30319",
      "csc.exe"
    ),
  ];
  const compiler = candidates.find(existsSync);
  if (!compiler) {
    throw new Error(
      `Windows .NET Framework C# compiler not found: ${candidates.join(", ")}`
    );
  }

  const source = path.join(import.meta.dir, "windows-launcher.cs");
  const result = Bun.spawnSync(
    [
      compiler,
      "/nologo",
      "/target:winexe",
      "/platform:x64",
      "/optimize+",
      `/win32icon:${icon}`,
      `/out:${output}`,
      source,
    ],
    { stdio: ["ignore", "inherit", "inherit"] }
  );
  if (result.exitCode !== 0 || !existsSync(output)) {
    throw new Error(
      `Windows console-free launcher compilation failed with ${result.exitCode}.`
    );
  }
}
