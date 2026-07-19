/**
 * Electrobun 1.18.1's prebuilt macOS binaries inherit the OS version of the
 * machine that built them. That makes the arm64 wrapper require macOS 14.8.5
 * and the x64 wrapper require macOS 15.7.5, even though Electrobun supports
 * macOS 14+.
 *
 * Run immediately before signing and lower LC_BUILD_VERSION /
 * LC_VERSION_MIN_MACOSX in every thin 64-bit Mach-O in the bundle to 14.0.
 * The edit is in-place and does not change command sizes or file offsets.
 * Electrobun signs all affected binaries after this hook runs.
 */

import {
  closeSync,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
  writeSync,
} from "node:fs";
import { join, relative } from "node:path";

const MH_MAGIC_64_LE = 0xfeedfacf;
const LC_VERSION_MIN_MACOSX = 0x24;
const LC_BUILD_VERSION = 0x32;
const MACHO_HEADER_SIZE = 32;
const TARGET_MACOS_VERSION = 0x000e0000;
const TARGET_MACOS_VERSION_LABEL = "14.0";

function _findBundle(): string {
  const wrapperPath = process.env.ELECTROBUN_WRAPPER_BUNDLE_PATH;
  if (wrapperPath) return wrapperPath;

  const buildDir = process.env.ELECTROBUN_BUILD_DIR;
  if (!buildDir) {
    throw new Error("no ELECTROBUN_BUILD_DIR in env");
  }
  const app = readdirSync(buildDir).find((name) => name.endsWith(".app"));
  if (!app) {
    throw new Error(`no .app bundle in ${buildDir}`);
  }
  return join(buildDir, app);
}

function _walkFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      files.push(..._walkFiles(path));
    } else if (stat.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function _fixFile(filePath: string): "fixed" | "ok" | "skipped" {
  const fd = openSync(filePath, "r+");
  try {
    const header = Buffer.alloc(MACHO_HEADER_SIZE);
    if (readSync(fd, header, 0, header.length, 0) !== header.length) {
      return "skipped";
    }
    if (header.readUInt32LE(0) !== MH_MAGIC_64_LE) return "skipped";

    const ncmds = header.readUInt32LE(16);
    const sizeofcmds = header.readUInt32LE(20);
    if (ncmds === 0 || sizeofcmds < 8 || sizeofcmds > 1024 * 1024) {
      throw new Error("invalid Mach-O load-command table");
    }

    const commands = Buffer.alloc(sizeofcmds);
    if (
      readSync(fd, commands, 0, commands.length, MACHO_HEADER_SIZE) !==
      commands.length
    ) {
      throw new Error("truncated Mach-O load-command table");
    }

    let offset = 0;
    let fixed = false;
    for (let i = 0; i < ncmds; i++) {
      if (offset + 8 > commands.length) {
        throw new Error("invalid Mach-O load command offset");
      }
      const cmd = commands.readUInt32LE(offset);
      const cmdsize = commands.readUInt32LE(offset + 4);
      if (cmdsize < 8 || offset + cmdsize > commands.length) {
        throw new Error("invalid Mach-O load command size");
      }

      const versionOffset =
        cmd === LC_BUILD_VERSION
          ? offset + 12
          : cmd === LC_VERSION_MIN_MACOSX
            ? offset + 8
            : undefined;
      if (versionOffset !== undefined) {
        const currentVersion = commands.readUInt32LE(versionOffset);
        if (currentVersion > TARGET_MACOS_VERSION) {
          const target = Buffer.alloc(4);
          target.writeUInt32LE(TARGET_MACOS_VERSION);
          writeSync(
            fd,
            target,
            0,
            target.length,
            MACHO_HEADER_SIZE + versionOffset
          );
          fixed = true;
        }
      }
      offset += cmdsize;
    }
    return fixed ? "fixed" : "ok";
  } finally {
    closeSync(fd);
  }
}

function _adhocSign(filePath: string): void {
  const result = Bun.spawnSync(
    ["codesign", "--force", "--sign", "-", filePath],
    {
      stderr: "inherit",
      stdout: "inherit",
    }
  );
  if (result.exitCode !== 0) {
    throw new Error(`failed to ad-hoc sign ${filePath}`);
  }
}

if (process.env.ELECTROBUN_OS === "macos") {
  try {
    const bundle = _findBundle();
    let fixed = 0;
    for (const filePath of _walkFiles(bundle)) {
      const result = _fixFile(filePath);
      if (result !== "fixed") continue;
      // arm64 Mach-O signatures are mandatory even without Gatekeeper. A local
      // `mise run pack` skips Electrobun's signing pass, so replace the invalid
      // signature created by the in-place edit. Canary/stable release builds
      // are signed normally by Electrobun immediately after this hook.
      if (process.env.LLM_SPACE_SKIP_SIGNING) _adhocSign(filePath);
      fixed++;
      console.info(
        `fix-macos-deployment-target: ${relative(bundle, filePath)} -> ${TARGET_MACOS_VERSION_LABEL}`
      );
    }
    console.info(
      `fix-macos-deployment-target: patched ${fixed} Mach-O file(s)`
    );
  } catch (error) {
    console.error(
      "fix-macos-deployment-target:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}
