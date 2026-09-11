import { electrobun } from "@/lib/electrobun";
import type { RuntimeId } from "@/shared/runtime";
import type { VercelStatus } from "@/shared/vercel";

function _rpc() {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  return electrobun.rpc;
}

/** Whether a Vercel deploy token is configured (the token itself stays in bun). */
export function getVercelStatus(): Promise<VercelStatus> {
  return _rpc().request.getVercelStatus({});
}

/** Save the Vercel token. The value crosses the bridge once and is never echoed back. */
export function setVercelToken(token: string): Promise<null> {
  return _rpc().request.setVercelToken({ token });
}

/** Forget the stored Vercel token. */
export function removeVercelToken(): Promise<null> {
  return _rpc().request.removeVercelToken({});
}

/**
 * Deploy a workspace folder of static files (must contain `index.html`) to
 * Vercel. Resolves to the public URL, or `{ok:false}` with friendly copy.
 */
export function deployToVercel(
  runtimeId: RuntimeId,
  path: string
): Promise<import("@/shared/vercel").DeployVercelRpcResult> {
  return _rpc().request.deployToVercel({ runtimeId, path });
}

/**
 * Validate a folder for deployment (index.html, file count, size limits)
 * without uploading. Used to disable the deploy dialog up front.
 */
export function vercelPreflight(
  runtimeId: RuntimeId,
  path: string
): Promise<import("@/shared/vercel").VercelPreflightResult> {
  return _rpc().request.vercelPreflight({ runtimeId, path });
}
