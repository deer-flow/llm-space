import { execFileSync } from "node:child_process";
import path from "node:path";

// Shared Windows tar helpers for the build hooks: parse a GNU-tar archive
// (resolving GNU LongLink `L` entries, dropping PAX `x`/`g` headers), rewrite
// it in ustar format, and decompress electrobun's zig-zstd tar.zst bundles.
// No top-level side effects.

const BLOCK = 512;

export interface TarEntry {
  name: string;
  mode: number;
  mtime: number;
  type: string;
  data: Uint8Array;
}

function octal(value: number, width: number): string {
  return value.toString(8).padStart(width, "0");
}

// Find a prefix/name split for a path longer than 100 chars: the longest
// prefix ending at a `/` that still leaves <= 100 chars in the name field.
// Mirrors what GNU tar does with --format=ustar.
export function splitName(full: string): { prefix: string; name: string } {
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
export function parseTar(data: Uint8Array): TarEntry[] {
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

export function writeUstarTar(entries: TarEntry[]): Uint8Array {
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

// Locate electrobun's bundled zig-zstd binary (decompress/compress for
// tar.zst), shipped under the package's dist-win-x64 directory.
export function resolveZigZstdExe(): string {
  const desktopRoot = path.resolve(import.meta.dir, "..");
  const electrobunPkgPath = require.resolve("electrobun/package.json", {
    paths: [desktopRoot],
  });
  return path.join(
    path.dirname(electrobunPkgPath),
    "dist-win-x64",
    "zig-zstd.exe"
  );
}

// Decompress a .tar.zst archive into a plain tar file at outPath.
export function decompressTarZst(
  zigZstd: string,
  archivePath: string,
  outPath: string
): void {
  execFileSync(zigZstd, [
    "decompress",
    "-i",
    archivePath,
    "-o",
    outPath,
    "--no-timing",
  ]);
}
