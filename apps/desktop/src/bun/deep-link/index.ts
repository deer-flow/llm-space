import type { SharedThreadSource, ThreadConnector } from "@llm-space/core";
import type { LocalFileSystem } from "@llm-space/core/server";
import {
  createGistConnector,
  GIST_CONNECTOR_ID,
  importSharedThread,
} from "@llm-space/core/storage";

import type { GitHubAuthManager } from "../auth";
import type { MainWindowRPC } from "../rpc";

/** `llm-space://shared/<connectorId>/threads/<threadId>` */
const DEEP_LINK_RE = /^llm-space:\/\/shared\/([^/]+)\/threads\/([^/?#]+)/;
const SHARE_WEB_ORIGIN = "https://deer-flow.github.io";
const SHARE_WEB_PATH = "/llm-space/";
const SHARE_WEB_HASH_RE = /^#\/shared\/([^/]+)\/threads\/([^/?#]+)/;

export function parseSharedImportUrl(
  value: string
): { connectorId: string; threadId: string } | null {
  const trimmed = value.trim();
  const deepLink = DEEP_LINK_RE.exec(trimmed);
  if (deepLink) {
    return { connectorId: deepLink[1], threadId: deepLink[2] };
  }

  try {
    const url = new URL(trimmed);
    if (url.origin !== SHARE_WEB_ORIGIN || url.pathname !== SHARE_WEB_PATH) {
      return null;
    }
    const webLink = SHARE_WEB_HASH_RE.exec(url.hash);
    return webLink
      ? { connectorId: webLink[1], threadId: webLink[2] }
      : null;
  } catch {
    return null;
  }
}

/** Where imported shared threads land (workspace-relative). */
const IMPORT_DIR = "shared";

export interface DeepLinkHandler {
  /** Parse a `llm-space://` URL and import the shared thread it points at. */
  handle(url: string): Promise<void>;
  /** Abort the in-flight import (from the renderer's Cancel button). */
  cancel(): void;
}

export interface DeepLinkDependencies {
  localFs: LocalFileSystem;
  githubAuth: GitHubAuthManager;
  getRpc: () => MainWindowRPC;
}

/**
 * Handles shared-thread deep links: reads the thread through the matching
 * connector and writes it into `workspace/shared/`, notifying the renderer of
 * progress so it can show an importing modal and open the result.
 */
export function createDeepLinkHandler({
  localFs,
  githubAuth,
  getRpc,
}: DeepLinkDependencies): DeepLinkHandler {
  const connectors: Record<string, ThreadConnector> = {
    [GIST_CONNECTOR_ID]: createGistConnector({
      getToken: () => githubAuth.getAccessToken(),
    }),
  };
  let controller: AbortController | null = null;

  const notify = (payload: Parameters<
    MainWindowRPC["send"]["sharedImportStatusChanged"]
  >[0]) => getRpc().send.sharedImportStatusChanged(payload);

  return {
    async handle(url) {
      const shared = parseSharedImportUrl(url);
      if (!shared) return; // not a shared-thread URL — ignore
      const { connectorId, threadId } = shared;

      const connector = connectors[connectorId];
      if (!connector || !("readShared" in connector.storage)) {
        notify({
          status: "error",
          message: `Can't import: unknown connector "${connectorId}".`,
        });
        return;
      }

      controller?.abort();
      const current = new AbortController();
      controller = current;

      notify({ status: "importing" });
      try {
        const { path, title } = await importSharedThread(
          connector.storage as SharedThreadSource,
          threadId,
          localFs,
          { dir: IMPORT_DIR, originalUrl: url, signal: current.signal }
        );
        if (current.signal.aborted) return;
        notify({ status: "success", path, title });
      } catch (error) {
        // Cancelled → the renderer already closed the modal; stay silent.
        if (current.signal.aborted) return;
        notify({
          status: "error",
          message:
            error instanceof Error ? error.message : "Import failed.",
        });
      } finally {
        if (controller === current) controller = null;
      }
    },
    cancel() {
      controller?.abort();
    },
  };
}
