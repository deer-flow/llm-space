import { electrobun } from "@/lib/electrobun";

function _rpc() {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  return electrobun.rpc;
}

/**
 * Open the native folder picker for the project's parent directory. `path` is
 * `null` on cancel.
 */
export function pickGeneratorDirectory(): Promise<{ path: string | null }> {
  return _rpc().request.generatorPickDirectory({});
}

/**
 * Resolve `parentDir/projectName`, validate + create it, and authorize it
 * (bun-side) for the generator's writes + `uv` runs.
 */
export function prepareGeneratorDirectory(
  parentDir: string,
  projectName: string
): Promise<{ ok: true; dir: string } | { ok: false; error: string }> {
  return _rpc().request.generatorPrepareDirectory({ parentDir, projectName });
}

/** Whether `uv` is installed on the host, and its version when detectable. */
export function checkUv(): Promise<{ installed: boolean; version?: string }> {
  return _rpc().request.generatorCheckUv({});
}

/** Run `uv <args>` in an authorized project directory. */
export function runUv(
  rootDir: string,
  args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  return _rpc().request.generatorRunUv({ rootDir, args });
}

/** Write a text file under an authorized project directory. */
export async function writeProjectFile(
  rootDir: string,
  relativePath: string,
  contents: string
): Promise<void> {
  await _rpc().request.generatorWriteFile({ rootDir, relativePath, contents });
}

/** Delete a file under an authorized project directory; no-op when missing. */
export async function removeProjectFile(
  rootDir: string,
  relativePath: string
): Promise<void> {
  await _rpc().request.generatorRemoveFile({ rootDir, relativePath });
}

/** Resolve the model's real API key + named environment variable values. */
export function resolveGeneratorEnv(
  providerId: string,
  envNames: string[]
): Promise<{ modelApiKey: string; envValues: Record<string, string> }> {
  return _rpc().request.generatorResolveEnv({ providerId, envNames });
}
