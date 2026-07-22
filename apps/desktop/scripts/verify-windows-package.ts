import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { zstdDecompressSync } from "node:zlib";

export interface TarEntry {
  name: string;
  size: number;
  type: string;
}

const TAR_BLOCK_SIZE = 512;
const REQUIRED_WINDOWS_PATHS = [
  "bin/launcher.exe",
  "bin/launcher-core.exe",
  "bin/bun.exe",
  "Resources/main.js",
  "Resources/app/views/mainview/index.html",
] as const;

export function verifyWindowsTar(data: Uint8Array): TarEntry[] {
  const entries = _readTarEntries(data);
  for (const entry of entries) {
    if (entry.type === "L") {
      throw new Error(
        `Windows package contains a GNU LongLink record (${entry.name}). Shorten packaged paths; Electrobun's Windows extractor cannot install this archive.`
      );
    }
    _assertSafeArchivePath(entry.name);
  }

  for (const required of REQUIRED_WINDOWS_PATHS) {
    if (!entries.some((entry) => entry.name.endsWith(`/${required}`))) {
      throw new Error(`Windows package is missing required entry: ${required}`);
    }
  }
  return entries;
}

export function verifyWindowsUpdateJson(
  value: string
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Windows update JSON is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Windows update JSON must contain an object.");
  }
  const update = parsed as Record<string, unknown>;
  if (update.platform !== "win" || update.arch !== "x64") {
    throw new Error(
      `Update metadata is not Windows x64 (platform=${String(update.platform)}, arch=${String(update.arch)}).`
    );
  }
  return update;
}

export function verifyWindowsPackage(artifactDirectory: string): {
  archive: string;
  installer: string;
  updateJson: string;
  entryCount: number;
} {
  const files = readdirSync(artifactDirectory);
  const archive = _findSingleArtifact(
    files,
    (name) => name.endsWith(".tar.zst"),
    "full Windows update archive"
  );
  const installer = _findSingleArtifact(
    files,
    (name) => name.endsWith(".zip") && name.includes("Setup"),
    "Windows Setup ZIP"
  );
  const updateJson = _findSingleArtifact(
    files,
    (name) => name.endsWith("update.json"),
    "Windows update JSON"
  );

  const archivePath = path.join(artifactDirectory, archive);
  const tar = zstdDecompressSync(readFileSync(archivePath));
  const entries = verifyWindowsTar(tar);
  verifyWindowsUpdateJson(
    readFileSync(path.join(artifactDirectory, updateJson), "utf8")
  );

  const installerPath = path.join(artifactDirectory, installer);
  const installerBytes = statSync(installerPath).size;
  if (installerBytes < 1024 * 1024) {
    throw new Error(
      `Windows Setup ZIP is unexpectedly small (${installerBytes} bytes): ${installer}`
    );
  }

  return {
    archive: archivePath,
    installer: installerPath,
    updateJson: path.join(artifactDirectory, updateJson),
    entryCount: entries.length,
  };
}

function _readTarEntries(data: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = [];
  for (let offset = 0; offset + TAR_BLOCK_SIZE <= data.length;) {
    const header = data.subarray(offset, offset + TAR_BLOCK_SIZE);
    if (header.every((byte) => byte === 0)) break;

    const name = _readTarString(header, 0, 100);
    const prefix = _readTarString(header, 345, 155);
    const sizeText = _readTarString(header, 124, 12).trim();
    const size = sizeText ? Number.parseInt(sizeText, 8) : 0;
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error(`Windows package has an invalid tar size for ${name}.`);
    }
    const fullName = prefix ? `${prefix}/${name}` : name;
    const typeByte = header[156];
    entries.push({
      name: fullName,
      size,
      type: typeByte === 0 ? "0" : String.fromCharCode(typeByte),
    });

    offset +=
      TAR_BLOCK_SIZE + Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
    if (offset > data.length) {
      throw new Error(
        `Windows package tar entry exceeds archive bounds: ${fullName}`
      );
    }
  }
  return entries;
}

function _readTarString(
  data: Uint8Array,
  offset: number,
  length: number
): string {
  const bytes = data.subarray(offset, offset + length);
  const end = bytes.indexOf(0);
  return new TextDecoder().decode(end === -1 ? bytes : bytes.subarray(0, end));
}

function _assertSafeArchivePath(value: string): void {
  const normalized = value.replaceAll("\\", "/");
  if (
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw new Error(`Windows package contains an unsafe path: ${value}`);
  }
}

function _findSingleArtifact(
  files: string[],
  predicate: (name: string) => boolean,
  description: string
): string {
  const matches = files.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${description}, found ${matches.length}: ${matches.join(", ") || "none"}`
    );
  }
  return matches[0];
}

if (import.meta.main) {
  const artifactDirectory = path.resolve(
    process.argv[2] ?? path.join(import.meta.dir, "..", "artifacts")
  );
  const result = verifyWindowsPackage(artifactDirectory);
  console.info(
    `Verified Windows x64 package: ${path.basename(result.installer)}; ${result.entryCount} tar entries; no GNU LongLink records.`
  );
}
