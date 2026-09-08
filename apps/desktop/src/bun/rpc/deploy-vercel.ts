import { stat } from "node:fs/promises";

import type { RuntimeClient, RuntimeId } from "@llm-space/runtime/runtime";

import { VercelDeployError, deploySingleFile, deployStaticFolder } from "../vercel";

export interface DeployVercelInput {
  runtimeId?: RuntimeId;
  /**
   * Workspace-relative deploy target: a folder of static files (must contain
   * an `index.html`) or one self-contained HTML file (served as the site's
   * index page).
   */
  path: string;
}

export type DeployVercelResult =
  | { ok: true; url: string; fileCount: number }
  | { ok: false; error: string };

interface DeployVercelHandlerDependencies {
  getRuntime: (runtimeId: RuntimeId) => RuntimeClient;
  getToken: () => string | null;
}

/**
 * Create the Bun RPC handler that deploys a workspace folder of static files
 * to Vercel. The token is read inside the bun process; the renderer receives
 * only the resulting URL or a friendly error.
 */
export function createDeployVercelHandler({
  getRuntime,
  getToken,
}: DeployVercelHandlerDependencies) {
  return async ({
    runtimeId,
    path,
  }: DeployVercelInput): Promise<DeployVercelResult> => {
    const token = getToken();
    if (!token) {
      return {
        ok: false,
        error: "Vercel token is not configured. Add one in Settings → Account.",
      };
    }
    try {
      if (!runtimeId) {
        throw new VercelDeployError("No runtime is available for this deploy.");
      }
      const runtime = getRuntime(runtimeId);
      if (runtime.info().status !== "connected") {
        throw new VercelDeployError(`Runtime is not connected: ${runtimeId}`);
      }
      const resolved = await runtime.fsRealpath(path);
      // A single HTML file deploys as a self-contained page; anything else
      // deploys as a folder.
      const isFile = (await stat(resolved)).isFile();
      const result = isFile
        ? await deploySingleFile({ token, file: resolved })
        : await deployStaticFolder({ token, dir: resolved });
      return {
        ok: true,
        url: result.url,
        fileCount: result.fileCount,
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : "Vercel deployment failed.",
      };
    }
  };
}
