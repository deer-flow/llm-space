/**
 * Result of the `deployToVercel` RPC: a ready deployment URL, or a
 * renderer-friendly error (network/401/limits never throw across the bridge).
 */
export type DeployVercelRpcResult =
  { ok: true; url: string; fileCount: number } | { ok: false; error: string };

/** Renderer-safe Vercel connection status: never carries the token. */
export interface VercelStatus {
  configured: boolean;
}

/**
 * Preflight check for the deploy dialog: validates the folder (index.html
 * presence, file count, size limits) without uploading anything.
 */
export type VercelPreflightResult =
  | { ok: true; fileCount: number; totalBytes: number }
  | { ok: false; error: string };
