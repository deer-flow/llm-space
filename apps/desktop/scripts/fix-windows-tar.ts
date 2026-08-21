import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

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

const desktopRoot = path.resolve(import.meta.dir, "..");
const electrobunPkgPath = require.resolve("electrobun/package.json", {
  paths: [desktopRoot],
});
const zigZstd = path.join(
  path.dirname(electrobunPkgPath),
  "dist-win-x64",
  "zig-zstd.exe"
);

const BLOCK = 512;

function octal(value: number, width: number): string {
  return value.toString(8).padStart(width, "0");
}

// Find a prefix/name split for a path longer than 100 chars: the longest
// prefix ending at a `/` that still leaves <= 100 chars in the name field.
// Mirrors what GNU tar does with --format=ustar.
function splitName(full: string): { prefix: string; name: string } {
  if (full.length <= 100) return { prefix: "", name: full };
  for (let p = Math.min(155, full.length - 2); p > 0; p--) {
    if (full[p] === "/" && full.length - p - 1 <= 100) {
      return { prefix: full.slice(0, p), name: full.slice(p + 1) };
    }
  }
  throw new Error(`[fix-windows-tar] cannot split tar path (${full.length} chars): ${full}`);
}

// Parse a tar (all entries in memory) and return { name, mode, mtime, type,
// data }. GNU LongLink entries are resolved into the name of the entry that
// follows them; PAX extended headers are dropped.
function parseTar(data: Uint8Array): {
  name: string;
  mode: number;
  mtime: number;
  type: string;
  data: Uint8Array;
}[] {
  const entries = [];
  let off = 0;
  let pendingLongName: string | null = null;
  const text = new TextDecoder();
  while (off + BLOCK <= data.length) {
    const header = data.subarray(off, off + BLOCK);
    if (header.every((b) => b === 0)) break;
    const nameField = text.decode(header.subarray(0, 100)).split("\0")[0];
    if (!nameField) break;
    const size = parseInt(
      text.decode(header.subarray(124, 136)).split("\0")[0].trim(),
      8
    ) || 0;
    const type = String.fromCharCode(header[156] || 48);
    const payload = data.subarray(off + BLOCK, off + BLOCK + size);
    const dataEnd = off + BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    if (type === "L") {
      pendingLongName = text.decode(payload).split("\0")[0];
    } else if (type === "x" || type === "g") {
      // Extended header — drop (we never write them; tolerate stale input).
    } else if (type === "0" || type === "5") {
      const name = pendingLongName ?? nameField;
      pendingLongName = null;
      const mode =
        parseInt(text.decode(header.subarray(100, 108)).split("\0")[0].trim(), 8) || 0;
      const mtime =
        parseInt(text.decode(header.subarray(136, 148)).split("\0")[0].trim(), 8) || 0;
      entries.push({ name, mode, mtime, type, data: type === "0" ? payload.slice() : new Uint8Array() });
    } else {
      throw new Error(`[fix-windows-tar] unsupported input tar type '${type}' for ${nameField}`);
    }
    off = dataEnd;
  }
  return entries;
}

function writeUstarTar(entries: { name: string; mode: number; mtime: number; type: string; data: Uint8Array }[]): Uint8Array {
  const textEncoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const entry of entries) {
    const header = new Uint8Array(BLOCK);
    const { prefix, name } = splitName(entry.name);
    header.set(textEncoder.encode(name));
    header.set(textEncoder.encode(octal(entry.mode, 7) + "\0"), 100);
    header.set(textEncoder.encode(octal(0, 7) + "\0"), 108); // uid
    header.set(textEncoder.encode(octal(0, 7) + "\0"), 116); // gid
    header.set(textEncoder.encode(octal(entry.data.length, 11) + "\0"), 124);
    header.set(textEncoder.encode(octal(entry.mtime, 11) + "\0"), 136);
    // checksum: sum over header with the checksum field as spaces
    header.fill(0x20, 148, 156);
    let sum = 0;
    for (const b of header) sum += b;
    header.set(textEncoder.encode(octal(sum, 6) + "\0 "), 148);
    header[156] = entry.type.charCodeAt(0);
    header.set(textEncoder.encode("ustar\0"), 257);
    header.set(textEncoder.encode("00"), 263);
    header.set(textEncoder.encode(prefix), 345);
    chunks.push(header);
    if (entry.data.length > 0) {
      chunks.push(entry.data);
      const pad = (BLOCK - (entry.data.length % BLOCK)) % BLOCK;
      if (pad > 0) chunks.push(new Uint8Array(pad));
    }
  }
  chunks.push(new Uint8Array(BLOCK * 2));
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

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
