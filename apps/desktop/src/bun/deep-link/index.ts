import type { SharedThreadSource, ThreadConnector } from "@llm-space/core";
import type { LocalFileSystem } from "@llm-space/core/server";
import {
  createGistConnector,
  GIST_CONNECTOR_ID,
  importSharedThread,
} from "@llm-space/core/storage";
import type { ThreadStorageRegistry } from "@llm-space/runtime/plugins";

import {
  type DeepLinkScheme,
  resolveDeepLinkScheme,
} from "../../shared/deep-link-scheme";
import type { GitHubAuthManager } from "../auth";
import type { MainWindowRPC } from "../rpc";

/** `shared/<connectorId>/threads/<threadId>` */
const SHARED_DEEP_LINK_RE = /^shared\/([^/]+)\/threads\/([^/?#]+)/;
/** `threads/<deepLinkId>/<resourceId>` */
const STORAGE_DEEP_LINK_RE = /^threads\/([^/]+)\/(.*)$/;

/** Where imported shared threads land (workspace-relative). */
const IMPORT_DIR = "shared";
const STORAGE_IMPORT_DIR = "imported";

export interface DeepLinkHandler {
  /** Parse an active-build deep link and import the thread it points at. */
  handle(url: string): Promise<void>;
  /** Abort the in-flight import (from the renderer's Cancel button). */
  cancel(): void;
}

export interface DeepLinkDependencies {
  localFs: LocalFileSystem;
  githubAuth: GitHubAuthManager;
  threadStorages: ThreadStorageRegistry;
  getRpc: () => MainWindowRPC;
  scheme?: DeepLinkScheme;
}

/**
 * Handles shared-thread deep links: reads the thread through the matching
 * connector and writes it into `workspace/shared/`, notifying the renderer of
 * progress so it can show an importing modal and open the result.
 */
export function createDeepLinkHandler({
  localFs,
  githubAuth,
  threadStorages,
  getRpc,
  scheme = resolveDeepLinkScheme(process.env.LLM_SPACE_DEEP_LINK_SCHEME),
}: DeepLinkDependencies): DeepLinkHandler {
  const connectors: Record<string, ThreadConnector> = {
    [GIST_CONNECTOR_ID]: createGistConnector({
      getToken: () => githubAuth.getAccessToken(),
    }),
  };
  let controller: AbortController | null = null;

  const notify = (
    payload: Parameters<MainWindowRPC["send"]["sharedImportStatusChanged"]>[0]
  ) => getRpc().send.sharedImportStatusChanged(payload);

  return {
    async handle(url) {
      const prefix = `${scheme}://`;
      if (!url.startsWith(prefix)) return;
      const route = url.slice(prefix.length);
      const sharedMatch = SHARED_DEEP_LINK_RE.exec(route);
      const storageMatch = STORAGE_DEEP_LINK_RE.exec(route);
      if (!sharedMatch && !storageMatch) return;

      controller?.abort();
      const current = new AbortController();
      controller = current;

      notify({ status: "importing" });
      try {
        const { path, title } = sharedMatch
          ? await _importShared({
              connectors,
              match: sharedMatch,
              localFs,
              url,
              signal: current.signal,
            })
          : await _importFromStorage({
              threadStorages,
              match: storageMatch!,
              localFs,
              url,
              signal: current.signal,
            });
        if (current.signal.aborted) return;
        notify({ status: "success", path, title });
      } catch (error) {
        // Cancelled → the renderer already closed the modal; stay silent.
        if (current.signal.aborted) return;
        notify({
          status: "error",
          message: error instanceof Error ? error.message : "Import failed.",
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

async function _importShared({
  connectors,
  match,
  localFs,
  url,
  signal,
}: {
  connectors: Record<string, ThreadConnector>;
  match: RegExpExecArray;
  localFs: LocalFileSystem;
  url: string;
  signal: AbortSignal;
}) {
  const [, connectorId, threadId] = match;
  const connector = connectors[connectorId];
  if (!connector || !("readShared" in connector.storage)) {
    throw new Error(`Can't import: unknown connector "${connectorId}".`);
  }
  return importSharedThread(
    connector.storage as SharedThreadSource,
    threadId,
    localFs,
    { dir: IMPORT_DIR, originalUrl: url, signal }
  );
}

async function _importFromStorage({
  threadStorages,
  match,
  localFs,
  url,
  signal,
}: {
  threadStorages: ThreadStorageRegistry;
  match: RegExpExecArray;
  localFs: LocalFileSystem;
  url: string;
  signal: AbortSignal;
}) {
  const deepLinkId = _decodeSegment(match[1]);
  // The storage owns the complete suffix. Do not parse or decode its path,
  // query, or fragment — it is an opaque storage-specific resource id.
  const resourceId = match[2];
  const storage = threadStorages.findByDeepLinkId(deepLinkId);
  if (!storage?.capabilities.read) {
    throw new Error(`Can't import: unknown Thread Storage "${deepLinkId}".`);
  }

  const source: SharedThreadSource = {
    async readShared(id) {
      signal.throwIfAborted();
      const locator = await threadStorages.resolveLatest(storage.id, id);
      signal.throwIfAborted();
      const thread = await threadStorages.read(storage.id, locator);
      signal.throwIfAborted();
      return {
        thread,
        meta: {
          connectorId: deepLinkId,
          threadId: id,
          filename: locator.filename,
          version: locator.version,
          title: thread.title,
        },
      };
    },
  };
  return importSharedThread(source, resourceId, localFs, {
    dir: STORAGE_IMPORT_DIR,
    originalUrl: url,
    signal,
  });
}

function _decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error("Can't import: invalid thread deep link.");
  }
}
