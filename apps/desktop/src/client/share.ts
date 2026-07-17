import { electrobun } from "@/lib/electrobun";

function _rpc() {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  return electrobun.rpc;
}

/** The result of publishing a thread: the web viewer link + the gist id. */
export interface ShareThreadResult {
  shareUrl: string;
  gistId: string;
}

/** Optional display metadata for the shared copy (does not touch the local file). */
export interface ShareThreadMeta {
  title?: string;
  description?: string;
}

/**
 * Publish a workspace thread as a secret GitHub Gist and return its shareable
 * web link. Requires GitHub sign-in (the bun side throws otherwise); each call
 * creates a fresh gist. `meta.title`/`meta.description` set the shared copy's
 * viewer metadata.
 */
export async function shareThread(
  path: string,
  meta?: ShareThreadMeta
): Promise<ShareThreadResult> {
  return _rpc().request.shareThread({
    path,
    title: meta?.title,
    description: meta?.description,
  });
}
