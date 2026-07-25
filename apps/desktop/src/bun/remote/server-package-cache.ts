import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { getSettingsDir } from "@llm-space/core/server";

export interface ServerPackageCacheInput {
  assetName: string;
  assetUrl: string;
  checksumUrl: string;
}

export interface ServerPackageCacheResult {
  path: string;
  sha256?: string;
}

export type FetchLike = typeof fetch;

const DOWNLOAD_TIMEOUT_MS = 240_000;

export async function getOrDownloadServerPackage(
  input: ServerPackageCacheInput,
  fetchImpl: FetchLike = fetch
): Promise<ServerPackageCacheResult> {
  const cacheDir = path.join(getSettingsDir(), "remote-runtime-packages");
  const archivePath = path.join(cacheDir, input.assetName);
  await mkdir(cacheDir, { recursive: true });

  const expectedSha256 = await _fetchChecksum(input, fetchImpl);
  if (expectedSha256 && (await _matchesSha256(archivePath, expectedSha256))) {
    return { path: archivePath, sha256: expectedSha256 };
  }

  const tmpPath = `${archivePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await _downloadToFile(input.assetUrl, tmpPath, fetchImpl);
    if (expectedSha256 && !(await _matchesSha256(tmpPath, expectedSha256))) {
      throw new Error(
        `Server package checksum mismatch for ${input.assetName}: expected ${expectedSha256}.`
      );
    }
    await rename(tmpPath, archivePath);
    return { path: archivePath, sha256: expectedSha256 };
  } catch (error) {
    await rm(tmpPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function _fetchChecksum(
  input: ServerPackageCacheInput,
  fetchImpl: FetchLike
): Promise<string | undefined> {
  const response = await _fetchWithTimeout(input.checksumUrl, fetchImpl);
  if (response.status === 404) return undefined;
  if (!response.ok) {
    throw new Error(
      `Failed to download server package checksum: HTTP ${response.status} ${input.checksumUrl}`
    );
  }
  const text = await response.text();
  const [hash] = text.trim().split(/\s+/);
  if (!/^[a-f0-9]{64}$/i.test(hash ?? "")) {
    throw new Error(`Invalid server package checksum file: ${input.checksumUrl}`);
  }
  return hash.toLowerCase();
}

async function _downloadToFile(
  url: string,
  filePath: string,
  fetchImpl: FetchLike
): Promise<void> {
  const response = await _fetchWithTimeout(url, fetchImpl);
  if (!response.ok) {
    throw new Error(`Failed to download server package: HTTP ${response.status} ${url}`);
  }
  const bytes = await response.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));
}

async function _fetchWithTimeout(
  url: string,
  fetchImpl: FetchLike
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        `Server package download timed out after ${DOWNLOAD_TIMEOUT_MS}ms: ${url}`,
        { cause: error }
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function _matchesSha256(
  filePath: string,
  expected: string
): Promise<boolean> {
  try {
    const bytes = await readFile(filePath);
    return createHash("sha256").update(bytes).digest("hex") === expected;
  } catch {
    return false;
  }
}
