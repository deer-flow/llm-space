import { stat } from "node:fs/promises";

import type { RuntimeClient, RuntimeId } from "@llm-space/runtime/runtime";

import { VercelDeployError, collectSingleFile, collectStaticFiles } from "../vercel";

export interface VercelPreflightInput {
  runtimeId?: RuntimeId;
  /** Workspace-relative deploy target: a static folder or one HTML file. */
  path: string;
}

interface VercelPreflightHandlerDependencies {
  getRuntime: (runtimeId: RuntimeId) => RuntimeClient;
}

/**
 * Create the Bun RPC handler that validates a deploy target for Vercel
 * without uploading: for folders, index.html presence, file count, and size
 * limits; for a single HTML file, its size. Metadata only — file contents
 * are never read.
 */
export function createVercelPreflightHandler({
  getRuntime,
}: VercelPreflightHandlerDependencies) {
  return async ({
    runtimeId,
    path,
  }: VercelPreflightInput): Promise<
    | { ok: true; fileCount: number; totalBytes: number }
    | { ok: false; error: string }
  > => {
    try {
      if (!runtimeId) {
        throw new VercelDeployError("No runtime is available for this deploy.");
      }
      const runtime = getRuntime(runtimeId);
      if (runtime.info().status !== "connected") {
        throw new VercelDeployError(`Runtime is not connected: ${runtimeId}`);
      }
      const resolved = await runtime.fsRealpath(path);
      const collected = (await stat(resolved)).isFile()
        ? await collectSingleFile(resolved, { withContents: false })
        : await collectStaticFiles(resolved, { withContents: false });
      return {
        ok: true,
        fileCount: collected.files.length,
        totalBytes: collected.totalBytes,
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "This folder cannot be deployed to Vercel.",
      };
    }
  };
}
