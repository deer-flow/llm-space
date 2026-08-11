import { randomUUID } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";
import { z } from "zod";

const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 200 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 10_000;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const PackageSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
});

export interface PluginInstallResult {
  pluginId: string;
  version: string;
  path: string;
}

/**
 * Installs one plugin ZIP by replacing the package-name-derived destination.
 * Extraction always happens outside the plugin directory; only a validated
 * package root is copied into the adjacent staging area before the swap.
 */
export async function installPluginZip({
  homePath,
  archive,
}: {
  homePath: string;
  archive: Uint8Array;
}): Promise<PluginInstallResult> {
  if (archive.byteLength === 0) throw new Error("The plugin ZIP is empty.");
  if (archive.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error("The plugin ZIP exceeds the 50 MB size limit.");
  }

  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "llm-space-plugin-")
  );
  try {
    await _extractZip(archive, temporaryRoot);
    const packageRoot = await _findPackageRoot(temporaryRoot);
    const metadata = PackageSchema.parse(
      JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"))
    );
    if (!PACKAGE_NAME.test(metadata.name)) {
      throw new Error(`Invalid npm package name: ${metadata.name}`);
    }

    const pluginsPath = path.join(homePath, "plugins");
    const stagingPath = path.join(
      pluginsPath,
      "node_modules",
      `.install-${randomUUID()}`
    );
    const backupPath = path.join(
      pluginsPath,
      "node_modules",
      `.backup-${randomUUID()}`
    );
    const targetPath = path.join(pluginsPath, ...metadata.name.split("/"));
    await mkdir(path.dirname(stagingPath), { recursive: true });
    try {
      await cp(packageRoot, stagingPath, {
        recursive: true,
        force: false,
        errorOnExist: true,
      });
      await mkdir(path.dirname(targetPath), { recursive: true });

      let hasBackup = false;
      try {
        await rename(targetPath, backupPath);
        hasBackup = true;
      } catch (error) {
        if (!_isMissing(error)) throw error;
      }

      try {
        await rename(stagingPath, targetPath);
      } catch (error) {
        if (hasBackup) await rename(backupPath, targetPath);
        throw error;
      }
      if (hasBackup) {
        await rm(backupPath, { recursive: true, force: true }).catch(
          () => undefined
        );
      }

      return {
        pluginId: metadata.name,
        version: metadata.version,
        path: targetPath,
      };
    } finally {
      await rm(stagingPath, { recursive: true, force: true });
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function _extractZip(archive: Uint8Array, destination: string) {
  const writes: Promise<void>[] = [];
  let entries = 0;
  let declaredBytes = 0;
  let extractedBytes = 0;
  let extractionError: Error | undefined;

  const unzip = new Unzip((file) => {
    try {
      entries += 1;
      if (entries > MAX_ARCHIVE_ENTRIES) {
        throw new Error("The plugin ZIP contains too many entries.");
      }
      const relativePath = _safeArchivePath(file.name);
      if (!relativePath || _isMacMetadata(relativePath)) {
        file.ondata = () => undefined;
        file.start();
        return;
      }
      if (file.originalSize !== undefined) {
        declaredBytes += file.originalSize;
        if (declaredBytes > MAX_EXTRACTED_BYTES) {
          throw new Error("The plugin ZIP expands beyond the 200 MB limit.");
        }
      }
      if (file.name.endsWith("/")) {
        file.ondata = () => undefined;
        file.start();
        return;
      }

      const chunks: Uint8Array[] = [];
      let fileBytes = 0;
      let failed = false;
      writes.push(
        new Promise<void>((resolve, reject) => {
          file.ondata = (error, data, final) => {
            if (failed) return;
            if (error) {
              failed = true;
              reject(error);
              return;
            }
            fileBytes += data.byteLength;
            extractedBytes += data.byteLength;
            if (extractedBytes > MAX_EXTRACTED_BYTES) {
              failed = true;
              chunks.length = 0;
              reject(
                new Error("The plugin ZIP expands beyond the 200 MB limit.")
              );
              return;
            }
            chunks.push(data);
            if (!final) return;
            const content = new Uint8Array(fileBytes);
            let offset = 0;
            for (const chunk of chunks) {
              content.set(chunk, offset);
              offset += chunk.byteLength;
            }
            const outputPath = path.join(destination, relativePath);
            void mkdir(path.dirname(outputPath), { recursive: true })
              .then(() => writeFile(outputPath, content))
              .then(() => resolve(), reject);
          };
          file.start();
        })
      );
    } catch (error) {
      extractionError = _asError(error);
      file.ondata = () => undefined;
    }
  });
  unzip.register(UnzipPassThrough);
  unzip.register(UnzipInflate);
  try {
    unzip.push(archive, true);
  } catch (error) {
    throw _asError(error);
  }
  if (extractionError) throw extractionError;
  await Promise.all(writes);
}

function _safeArchivePath(name: string): string {
  if (
    name.includes("\\") ||
    name.includes("\0") ||
    path.posix.isAbsolute(name)
  ) {
    throw new Error(`Unsafe path in plugin ZIP: ${name}`);
  }
  const parts = name.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) {
    throw new Error(`Unsafe path in plugin ZIP: ${name}`);
  }
  return parts.join(path.sep);
}

function _isMacMetadata(relativePath: string): boolean {
  const parts = relativePath.split(path.sep);
  const basename = parts.at(-1) ?? "";
  return (
    parts[0] === "__MACOSX" ||
    basename === ".DS_Store" ||
    basename.startsWith("._")
  );
}

async function _findPackageRoot(extractedRoot: string): Promise<string> {
  if (await _isFile(path.join(extractedRoot, "package.json"))) {
    return extractedRoot;
  }
  const entries = await readdir(extractedRoot, { withFileTypes: true });
  const candidates: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const candidate = path.join(extractedRoot, entry.name);
    if (await _isFile(path.join(candidate, "package.json"))) {
      candidates.push(candidate);
    }
  }
  if (candidates.length !== 1) {
    throw new Error(
      candidates.length === 0
        ? "The plugin ZIP must contain a package.json at its root."
        : "The plugin ZIP contains more than one package root."
    );
  }
  return candidates[0];
}

async function _isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function _isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function _asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
