import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import rcedit from "rcedit";

if (process.env.ELECTROBUN_OS === "win") {
  const artifactDirectory = _requiredEnv("ELECTROBUN_ARTIFACT_DIR");
  const [installerZip] = readdirSync(artifactDirectory).filter(
    (name) => name.endsWith(".zip") && name.includes("Setup")
  );
  if (!installerZip) {
    throw new Error("Windows Setup ZIP was not produced.");
  }

  const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "llm-space-icon-"));
  try {
    const zipPath = path.join(artifactDirectory, installerZip);
    const stagingDirectory = path.join(tempDirectory, "staging");
    _runPowerShell(
      "Expand-Archive -LiteralPath $env:ZIP_PATH -DestinationPath $env:STAGING -Force",
      { ZIP_PATH: zipPath, STAGING: stagingDirectory }
    );
    const setupFiles = readdirSync(stagingDirectory).filter((name) =>
      name.endsWith(".exe")
    );
    if (setupFiles.length !== 1) {
      throw new Error(
        `Expected one setup executable in ${installerZip}, found ${setupFiles.length}.`
      );
    }
    const setup = path.join(stagingDirectory, setupFiles[0]);
    await rcedit(setup, {
      icon: path.resolve(import.meta.dir, "..", "icon.ico"),
    });

    const repacked = path.join(tempDirectory, "installer.zip");
    _runPowerShell(
      "Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:STAGING, $env:REPACKED, [IO.Compression.CompressionLevel]::Optimal, $false)",
      { STAGING: stagingDirectory, REPACKED: repacked }
    );
    // The system temp directory and repository may be on different drives on
    // Windows, so renameSync would fail with EXDEV here. copyFileSync replaces
    // the build artifact across volumes; a failure still fails the build hook.
    copyFileSync(repacked, zipPath);
    console.info(`Embedded Windows icon: ${installerZip}/${setupFiles[0]}`);
  } finally {
    rmSync(tempDirectory, { force: true, recursive: true });
  }
}

function _runPowerShell(script: string, env: Record<string, string>): void {
  const result = Bun.spawnSync(
    [
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      script,
    ],
    {
      env: { ...process.env, ...env },
      stdio: ["ignore", "inherit", "inherit"],
    }
  );
  if (result.exitCode !== 0) {
    throw new Error(`PowerShell archive command exited with ${result.exitCode}.`);
  }
}

function _requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in Electrobun build hook.`);
  return value;
}
