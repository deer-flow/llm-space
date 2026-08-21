import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parseTar, resolveZigZstdExe, writeUstarTar } from "./win-tar";

// electrobun compresses the Windows bundle with the system `tar` (GNU tar on
// this machine), which emits GNU LongLink (`L`) entries for paths longer than
// 100 chars — e.g. Vite's `geist-mono-cyrillic-ext-wght-normal-I4S5GZfc.woff2`
// at 102 chars. Its own extractor (zig) rejects `L` with
// TarUnsupportedFileType, so install fails. The extractor DOES support the
// ustar prefix field (name[100] + prefix[155]), so rewrite the archive in
// ustar format, splitting long names across the two fields instead of using
// `L` entries. Remove this script when upstream switches to a compatible tar
// writer or fixes the extractor.
if (process.platform !== "win32") process.exit(0);

const zigZstd = resolveZigZstdExe();

function rewriteArchive(archivePath: string): boolean {
  if (!existsSync(archivePath)) return false;
  console.info(`[fix-windows-tar] rewriting ${archivePath}`);
  const tmpIn = archivePath + ".uncompressed";
  execFileSync(zigZstd, ["decompress", "-i", archivePath, "-o", tmpIn, "--no-timing"]);
  const entries = parseTar(readFileSync(tmpIn));
  const rewritten = writeUstarTar(entries);
  const tmpOut = archivePath + ".ustar";
  writeFileSync(tmpOut, rewritten);
  execFileSync(zigZstd, ["compress", "-i", tmpOut, "-o", archivePath, "--threads", "max", "--no-timing"]);
  execFileSync("cmd", ["/c", "del", "/f", "/q", tmpIn, tmpOut]);
  console.info(
    `[fix-windows-tar] rewritten ${entries.length} entries (long names: ${entries.filter((e) => e.name.length > 100).length})`
  );
  return true;
}

// postWrap runs after the bundle tar is compressed and the self-extracting
// wrapper bundle is created, so two copies exist: the artifact tar in the
// build dir and the wrapper's inner Resources/<hash>.tar.zst. The installer
// Setup exe later copies the build-dir tar, so fixing both covers install,
// the shipped archive, and the wrapper.
const buildDir = Bun.env.ELECTROBUN_BUILD_DIR;
if (buildDir) {
  for (const file of readdirSync(buildDir)) {
    if (file.endsWith(".tar.zst")) {
      rewriteArchive(path.join(buildDir, file));
    }
  }
}
const wrapperPath = Bun.env.ELECTROBUN_WRAPPER_BUNDLE_PATH;
if (wrapperPath) {
  const resources = path.join(wrapperPath, "Resources");
  if (existsSync(resources)) {
    for (const file of readdirSync(resources)) {
      if (file.endsWith(".tar.zst")) {
        rewriteArchive(path.join(resources, file));
      }
    }
  }
}
