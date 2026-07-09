/**
 * Workaround for https://github.com/blackboardsh/electrobun/issues/485.
 *
 * The darwin-x64 electrobun core binaries (extractor/launcher: headerpad 0,
 * libasar.dylib: 8) ship without LC_CODE_SIGNATURE and without room to add
 * one. Apple's `codesign` needs 16 bytes of load-command space to append its
 * LC_CODE_SIGNATURE — when there is none it silently overwrites the start of
 * `__text`, producing a signed, notarized app that segfaults on launch.
 * (arm64 is immune: ad-hoc signatures are mandatory there, so the linker
 * always reserves the load command.)
 *
 * Fix, applied before signing: for every thin x86_64 Mach-O in the bundle
 * that is unsigned and has headerpad < 16, drop the expendable
 * LC_SOURCE_VERSION (exactly 16 bytes; LC_UUID at 24 bytes as fallback). The
 * binary is otherwise byte-identical — verified against the v1.18.1 extractor
 * with a signed control (segfault) vs signed surgically-patched build (runs
 * clean). Becomes a no-op once upstream ships padded binaries; delete this
 * hook when #485 is fixed.
 *
 * Wired in electrobun.config.ts as both `postBuild` (inner bundle, runs
 * before its codesign) and `postWrap` (self-extracting wrapper, runs before
 * its codesign). A failing hook fails the whole build — that is intentional:
 * an unfixable binary must never reach signing.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MH_MAGIC_64_LE = 0xfeedfacf;
const CPU_TYPE_X86_64 = 0x01000007;
const LC_SEGMENT_64 = 0x19;
const LC_UUID = 0x1b;
const LC_CODE_SIGNATURE = 0x1d;
const LC_SOURCE_VERSION = 0x2a;
const MACHO_HEADER_SIZE = 32;
/** codesign appends one linkedit_data_command: 16 bytes. */
const REQUIRED_PAD = 16;

interface MachOInfo {
  isThinX64: boolean;
  hasCodeSignature: boolean;
  headerpad: number;
  commandOffsets: Map<number, { offset: number; size: number }>;
}

function _analyze(buf: Buffer): MachOInfo {
  const none: MachOInfo = {
    isThinX64: false,
    hasCodeSignature: false,
    headerpad: 0,
    commandOffsets: new Map(),
  };
  if (buf.length < MACHO_HEADER_SIZE) return none;
  if (buf.readUInt32LE(0) !== MH_MAGIC_64_LE) return none;
  if (buf.readUInt32LE(4) !== CPU_TYPE_X86_64) return none;

  const ncmds = buf.readUInt32LE(16);
  const sizeofcmds = buf.readUInt32LE(20);
  const commandOffsets = new Map<number, { offset: number; size: number }>();
  let hasCodeSignature = false;
  let minContentOffset = Number.MAX_SAFE_INTEGER;

  let offset = MACHO_HEADER_SIZE;
  for (let i = 0; i < ncmds; i++) {
    const cmd = buf.readUInt32LE(offset);
    const cmdsize = buf.readUInt32LE(offset + 4);
    if (!commandOffsets.has(cmd)) {
      commandOffsets.set(cmd, { offset, size: cmdsize });
    }
    if (cmd === LC_CODE_SIGNATURE) hasCodeSignature = true;
    if (cmd === LC_SEGMENT_64) {
      const nsects = buf.readUInt32LE(offset + 64);
      let sectionOffset = offset + 72;
      for (let s = 0; s < nsects; s++) {
        const secSize = Number(buf.readBigUInt64LE(sectionOffset + 40));
        const secFileOffset = buf.readUInt32LE(sectionOffset + 48);
        if (secFileOffset > 0 && secSize > 0) {
          minContentOffset = Math.min(minContentOffset, secFileOffset);
        }
        sectionOffset += 80;
      }
    }
    offset += cmdsize;
  }

  const endOfCommands = MACHO_HEADER_SIZE + sizeofcmds;
  const headerpad =
    minContentOffset === Number.MAX_SAFE_INTEGER
      ? 0
      : minContentOffset - endOfCommands;
  return { isThinX64: true, hasCodeSignature, headerpad, commandOffsets };
}

/** Remove one load command in place: shift the rest up, zero the freed tail. */
function _removeLoadCommand(
  buf: Buffer,
  target: { offset: number; size: number }
): void {
  const ncmds = buf.readUInt32LE(16);
  const sizeofcmds = buf.readUInt32LE(20);
  const endOfCommands = MACHO_HEADER_SIZE + sizeofcmds;
  buf.copyWithin(target.offset, target.offset + target.size, endOfCommands);
  buf.fill(0, endOfCommands - target.size, endOfCommands);
  buf.writeUInt32LE(ncmds - 1, 16);
  buf.writeUInt32LE(sizeofcmds - target.size, 20);
}

function _fixFile(filePath: string): "fixed" | "ok" | "skipped" | "failed" {
  const buf = Buffer.from(readFileSync(filePath));
  const info = _analyze(buf);
  if (!info.isThinX64) return "skipped";
  // A pre-signed binary (e.g. the bun runtime) re-signs in place — no room needed.
  if (info.hasCodeSignature) return "ok";
  if (info.headerpad >= REQUIRED_PAD) return "ok";

  const removable =
    info.commandOffsets.get(LC_SOURCE_VERSION) ??
    info.commandOffsets.get(LC_UUID);
  if (!removable) return "failed";
  _removeLoadCommand(buf, removable);

  const after = _analyze(buf);
  if (after.headerpad < REQUIRED_PAD) return "failed";
  writeFileSync(filePath, buf);
  return "fixed";
}

function _findBundle(): string {
  const wrapperPath = process.env.ELECTROBUN_WRAPPER_BUNDLE_PATH;
  if (wrapperPath) return wrapperPath;
  const buildDir = process.env.ELECTROBUN_BUILD_DIR;
  if (!buildDir) {
    console.error("fix-x64-headerpad: no ELECTROBUN_BUILD_DIR in env");
    process.exit(1);
  }
  const app = readdirSync(buildDir).find((name) => name.endsWith(".app"));
  if (!app) {
    console.error(`fix-x64-headerpad: no .app bundle in ${buildDir}`);
    process.exit(1);
  }
  return join(buildDir, app);
}

if (process.env.ELECTROBUN_OS !== "macos" || process.env.ELECTROBUN_ARCH !== "x64") {
  process.exit(0);
}

const bundle = _findBundle();
const macosDir = join(bundle, "Contents", "MacOS");
let failures = 0;
for (const name of readdirSync(macosDir)) {
  const filePath = join(macosDir, name);
  if (!statSync(filePath).isFile()) continue;
  const result = _fixFile(filePath);
  if (result === "failed") failures++;
  if (result !== "skipped") {
    console.info(`fix-x64-headerpad: ${name} — ${result}`);
  }
}
if (failures > 0) {
  console.error(
    "fix-x64-headerpad: some binaries have no room for LC_CODE_SIGNATURE and no removable load command — signing would corrupt them (electrobun#485)"
  );
  process.exit(1);
}
